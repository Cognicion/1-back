void (async () => {
  const fail = code => { throw Object.assign(new Error(code), { code }); };
  try {
    if (location.origin !== "https://cognicionlabs.com") fail("WRONG_ORIGIN");
    const { auth, authPersistenceReady, obtenerFunctions } = await import("/js/firebase.js");
    const { httpsCallable } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js");
    await authPersistenceReady;
    await auth.authStateReady();
    const professionalUid = "ypa8b80onaRHklCPi6O43AgQKJs1";
    if (!auth.currentUser) fail("UNAUTHENTICATED");
    if (auth.currentUser.uid !== professionalUid) fail("WRONG_ACCOUNT");
    const functions = await obtenerFunctions();
    if (functions.app.options.projectId !== "cognicion-57052") fail("WRONG_PROJECT");
    const remote = httpsCallable(functions, "configureWhatsAppBot");
    const call = async data => (await remote(data)).data;
    const expected = {
      professionalUid,
      phoneNumberId: "1324304140766499",
      wabaId: "1431133919107745",
      graphVersion: "v26.0"
    };
    const configuredPhone = "526691971091";
    // Esta forma concreta fue comprobada contra la huella del mensaje firmado
    // del piloto. No es una regla general de normalizacion de telefonos.
    const observedPhone = configuredPhone.slice(0, 2) + "1" + configuredPhone.slice(2);
    const verify = pilotPhone => call({
      action: "verifyExpectedChannel", expected: { ...expected, pilotPhone }
    });
    const exact = v => v?.matchesExpectedChannel === true && v.enabled === true;
    const before = await call({ action: "get" });
    if (before.admin !== true) fail("ADMIN_REQUIRED");
    const professionalReady = state => state.settings?.enabled === true &&
      state.settings.reminders?.enabled === false && state.payment === "not_configured" &&
      state.settings.services?.some(s => s.id === "consulta_qa" &&
        s.label === "Consulta QA" && s.durationMinutes === 60);
    if (!professionalReady(before)) fail("PILOT_SETTINGS_CONFLICT");
    let changed = false;
    if (!exact(await verify(observedPhone))) {
      if (!exact(await verify(configuredPhone))) fail("CONFLICTING_EXISTING_CONFIG");
      if (auth.currentUser?.uid !== professionalUid) fail("AUTH_CHANGED");
      await call({
        action: "configureChannel",
        channel: {
          enabled: true, pilot: true,
          phoneNumberId: expected.phoneNumberId,
          wabaId: expected.wabaId,
          graphVersion: expected.graphVersion,
          professionalIds: [professionalUid],
          allowedPhones: [observedPhone]
        }
      });
      changed = true;
    }
    const [personal, previous, business, after] = await Promise.all([
      verify(observedPhone), verify(configuredPhone),
      verify("5216692458280"), call({ action: "get" })
    ]);
    if (!exact(personal) || personal.authorizedRecipientCount !== 1 ||
        previous.expectedRecipientIncluded !== false ||
        business.expectedRecipientIncluded !== false || !professionalReady(after) ||
        JSON.stringify(before.settings) !== JSON.stringify(after.settings)) {
      fail("POSTCHECK_FAILED");
    }
    console.log(JSON.stringify({
      identityCorrected: true,
      changed,
      personalAuthorized: personal.expectedRecipientIncluded,
      businessAuthorized: business.expectedRecipientIncluded,
      authorizedRecipients: personal.authorizedRecipientCount,
      testChannelMatches: personal.phoneNumberMatches && personal.wabaMatches && personal.graphVersionMatches,
      onlyExpectedProfessional: personal.onlyExpectedProfessional,
      botEnabled: personal.enabled,
      pilotMode: personal.pilot,
      professionalSettingsUnchanged: true,
      remindersEnabled: after.settings.reminders.enabled,
      readyForManualRetry: true
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      identityCorrected: false,
      code: typeof error?.code === "string" && /^[A-Z_]+$|^functions\/[a-z-]+$/.test(error.code)
        ? error.code : "PILOT_IDENTITY_UPDATE_FAILED"
    }));
  }
})();
