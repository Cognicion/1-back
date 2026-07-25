function evaluate(expression = "") {
  const compact = String(expression).replace(/\s+/g, "");
  if (!compact) return 0;
  const tokens = compact.match(/\d+(?:\.\d+)?|[()+\-*/]/g);
  if (!tokens || tokens.join("") !== compact) return null;
  const output = [], operators = [], precedence = { "+": 1, "-": 1, "*": 2, "/": 2, "u-": 3 };
  let expectsValue = true;
  tokens.forEach((token) => {
    if (/^\d/.test(token)) { output.push(Number(token)); expectsValue = false; return; }
    if (token === "(") { operators.push(token); expectsValue = true; return; }
    if (token === ")") { while (operators.length && operators.at(-1) !== "(") output.push(operators.pop()); if (operators.pop() !== "(") throw new Error("Parentesis no balanceados"); expectsValue = false; return; }
    const operator = token === "-" && expectsValue ? "u-" : token;
    if (expectsValue && operator !== "u-") throw new Error("Operacion incompleta");
    while (operators.length && operators.at(-1) !== "(" && precedence[operators.at(-1)] > precedence[operator]) output.push(operators.pop());
    operators.push(operator); expectsValue = true;
  });
  if (expectsValue && operators.at(-1) !== ")") throw new Error("Operacion incompleta");
  while (operators.length) { const op = operators.pop(); if (op === "(") throw new Error("Parentesis no balanceados"); output.push(op); }
  const values = [];
  output.forEach((token) => { if (typeof token === "number") return values.push(token); if (token === "u-") { const value = values.pop(); if (value === undefined) throw new Error("Operacion incompleta"); return values.push(-value); } const right = values.pop(), left = values.pop(); if (left === undefined || right === undefined) throw new Error("Operacion incompleta"); if (token === "/" && right === 0) throw new Error("No se puede dividir entre cero"); values.push(token === "+" ? left + right : token === "-" ? left - right : token === "*" ? left * right : left / right); });
  if (values.length !== 1 || !Number.isFinite(values[0])) throw new Error("Operacion invalida");
  return values[0];
}

export function mount(container) {
  container.innerHTML = `<section class="calculadora-nota-detalle"><header><span>Convencional</span><h3>Calculadora convencional</h3><p>Realiza operaciones rápidas sin salir de la nota.</p></header><output class="calculadora-pantalla" aria-live="polite">0</output><div class="calculadora-teclado">${["C","⌫","(",")","÷","7","8","9","×","4","5","6","−","1","2","3","+","0",".","="].map((value) => `<button type="button" data-value="${value}">${value}</button>`).join("")}</div></section>`;
  let expression = "";
  const output = container.querySelector("output");
  const update = (value = expression || "0") => { output.textContent = value; };
  const onClick = (event) => { const button = event.target.closest("button"); if (!button) return; const value = button.dataset.value; if (value === "C") expression = ""; else if (value === "⌫") expression = expression.slice(0, -1); else if (value === "=") { try { expression = String(evaluate(expression)); } catch { expression = ""; update("Error"); return; } } else expression += value === "÷" ? "/" : value === "×" ? "*" : value === "−" ? "-" : value; update(); };
  container.addEventListener("click", onClick);
  return () => container.removeEventListener("click", onClick);
}
