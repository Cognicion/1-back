function deliveryAddress(phone) {
  // Meta can report Mexican mobile senders using the retired international
  // mobile marker (521 + 10 national digits), while Cloud API delivery uses
  // the current E.164 address (52 + the same 10 digits). Keep the inbound
  // identity untouched and normalize only the address sent to Graph API.
  return /^521\d{10}$/.test(phone || '') ? `52${phone.slice(3)}` : phone;
}
function outboundBody(to, content, correlation) {
  if (!/^\d{8,15}$/.test(to || '')) throw Error('invalid-recipient');
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to: deliveryAddress(to), biz_opaque_callback_data: correlation };
  if (content.template) return { ...base, type: 'template', template: content.template };
  if (typeof content.text !== 'string' || !content.text || content.text.length > 1024) throw Error('invalid-message');
  const choices = content.choices || [];
  if (choices.length > 10 || choices.some(x => !x.id || x.id.length > 200 || !x.title || x.title.length > 24)) throw Error('invalid-choices');
  if (!choices.length) return { ...base, type: 'text', text: { body: content.text, preview_url: false } };
  const button = choices.length <= 3 && choices.every(x => x.title.length <= 20);
  return { ...base, type: 'interactive', interactive: { type: button ? 'button' : 'list', body: { text: content.text }, action: button
    ? { buttons: choices.map(x => ({ type: 'reply', reply: { id: x.id, title: x.title } })) }
    : { button: 'Elegir', sections: [{ title: 'Opciones', rows: choices.map(x => ({ id: x.id, title: x.title, ...(x.description ? { description: x.description.slice(0,72) } : {}) })) }] } } };
}
function createTransport({ accessToken, fetchImpl = fetch }) {
  const headers = () => ({ authorization: `Bearer ${accessToken()}` });
  return {
    async send({ channel, to, content, correlation }) {
      if (!/^v\d{2}\.0$/.test(channel.graphVersion || '') || !/^\d{5,30}$/.test(channel.phoneNumberId || '')) return { state: 'blocked_configuration' };
      const token = accessToken();
      if (!token) return { state: 'blocked_credential' };
      const body = outboundBody(to, content, correlation);
      try {
        const r = await fetchImpl(`https://graph.facebook.com/${channel.graphVersion}/${channel.phoneNumberId}/messages`, { method: 'POST', signal: AbortSignal.timeout(10000), headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
        const data = await r.json();
        if (r.ok && typeof data.messages?.[0]?.id === 'string') return { state: 'accepted', messageId: data.messages[0].id };
        // 429 is a definite rejection. 5xx or missing acknowledgement may have
        // accepted the request: never blindly resend an uncertain submission.
        return { state: r.status === 429 ? 'retry' : r.status >= 500 || r.ok ? 'uncertain' : 'failed', code: Number(data.error?.code) || r.status };
      } catch { return { state: 'uncertain' }; }
    },
    async templateStatus(channel, name, language) {
      if(!accessToken())return 'MISSING_CREDENTIAL';
      const r = await fetchImpl(`https://graph.facebook.com/${channel.graphVersion}/${channel.wabaId}/message_templates?name=${encodeURIComponent(name)}&fields=name,status,language`, { headers: { authorization: `Bearer ${accessToken()}` }, signal: AbortSignal.timeout(10000) });
      if (!r.ok) return 'UNKNOWN';
      const data = await r.json();
      const status=data.data?.find(t => t.name === name && t.language === language)?.status;
      return !status?'MISSING':['APPROVED','PENDING','REJECTED','PAUSED','DISABLED','IN_APPEAL','DELETED'].includes(status)?status:'UNKNOWN';
    },
    async inspectChannel(channel) {
      if(!accessToken())return {verified:false,code:'MISSING_CREDENTIAL'};
      if(!/^v\d{2}\.0$/.test(channel?.graphVersion||'')||!/^\d{5,30}$/.test(channel?.wabaId||'')||!/^\d{5,30}$/.test(channel?.phoneNumberId||''))return {verified:false,code:'INVALID_ASSET_ID'};
      try {
        const base=`https://graph.facebook.com/${channel.graphVersion}`;
        const [accountResponse,numbersResponse,subscriptionsResponse]=await Promise.all([
          fetchImpl(`${base}/${channel.wabaId}?fields=id,name,account_review_status,business_verification_status,ownership_type`,{headers:headers(),signal:AbortSignal.timeout(10000)}),
          fetchImpl(`${base}/${channel.wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type,name_status,status`,{headers:headers(),signal:AbortSignal.timeout(10000)}),
          fetchImpl(`${base}/${channel.wabaId}/subscribed_apps?fields=id,name`,{headers:headers(),signal:AbortSignal.timeout(10000)})
        ]);
        if(!accountResponse.ok||!numbersResponse.ok)return {verified:false,code:'ASSET_NOT_ACCESSIBLE'};
        const account=await accountResponse.json(), numbers=await numbersResponse.json();
        const subscriptions=subscriptionsResponse.ok ? await subscriptionsResponse.json() : {data:[]};
        const phone=numbers.data?.find(item=>item.id===channel.phoneNumberId);
        if(!phone)return {verified:false,code:'PHONE_NOT_IN_WABA'};
        const digits=String(phone.display_phone_number||'').replace(/\D/g,'');
        const cloudApi=phone.platform_type==='CLOUD_API';
        const connected=phone.status==='CONNECTED';
        return {verified:cloudApi&&connected,code:cloudApi&&connected?'VERIFIED':'PHONE_NOT_READY',numberSuffix:digits.slice(-4),verifiedName:String(phone.verified_name||'').slice(0,80),qualityRating:phone.quality_rating||'UNKNOWN',codeVerificationStatus:phone.code_verification_status||'UNKNOWN',platformType:phone.platform_type||'UNKNOWN',phoneStatus:phone.status||'UNKNOWN',nameStatus:phone.name_status||'UNKNOWN',accountName:String(account.name||'').slice(0,80),accountReviewStatus:account.account_review_status||'UNKNOWN',businessVerificationStatus:account.business_verification_status||'UNKNOWN',ownershipType:account.ownership_type||'UNKNOWN',subscribed:Array.isArray(subscriptions.data)&&subscriptions.data.length>0};
      } catch { return {verified:false,code:'GRAPH_UNAVAILABLE'}; }
    },
    async subscribeApp(channel) {
      if(!accessToken())return {ok:false,code:'MISSING_CREDENTIAL'};
      try {
        const response=await fetchImpl(`https://graph.facebook.com/${channel.graphVersion}/${channel.wabaId}/subscribed_apps`,{method:'POST',headers:headers(),signal:AbortSignal.timeout(10000)});
        const data=await response.json();
        return {ok:response.ok&&data.success===true,code:response.ok?'OK':Number(data.error?.code)||response.status};
      } catch { return {ok:false,code:'GRAPH_UNAVAILABLE'}; }
    }
  };
}
module.exports = { createTransport, outboundBody, deliveryAddress };
