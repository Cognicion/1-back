import assert from "node:assert/strict";
import test from "node:test";
import { MASCOT_STATES } from "../js/sofia-mascota/config.js";
import { createMascotStateMachine } from "../js/sofia-mascota/mascotaStateMachine.js";

test("la máquina valida estados, evita renders repetidos y monta una sola transición", () => {
  const changes = [];
  const machine = createMascotStateMachine((change) => changes.push(change));
  assert.equal(machine.setState("thinking", { source: "test" }), true);
  assert.equal(machine.setState("thinking", { source: "test" }), false);
  assert.equal(machine.setState("not-a-state"), false);
  assert.equal(machine.getState(), MASCOT_STATES.THINKING);
  assert.equal(changes.length, 1);
  machine.destroy();
});

test("un estado temporal vuelve a idle y un estado nuevo cancela el timeout anterior", async () => {
  const changes = [];
  const machine = createMascotStateMachine((change) => changes.push(change));
  machine.setState("success", { duration: 25, fallbackState: "idle", source: "test" });
  machine.setState("thinking", { source: "test" });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(machine.getState(), MASCOT_STATES.THINKING);
  assert.deepEqual(changes.map((change) => change.nextState), ["success", "thinking"]);
  machine.destroy();
});
