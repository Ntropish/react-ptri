describe("usePtriValue hook (with isolated inputs)", () => {
  it("shows '-' with no live key, then initializes after typing a live key", () => {
    cy.visit("/");
    cy.get("#status").should("contain", "Ready");

    cy.get("#live-val-fp").invoke("text").should("match", /^-$/);

    const key = `hv0:${Date.now()}`;
    cy.get("#live-key").clear().type(key);
    cy.get("#live-val-fp")
      .invoke("text")
      .should((t) => expect(t.trim()).to.not.equal("-"));
  });

  it("updates when content for the live key changes and stays constant for identical writes", () => {
    cy.visit("/");
    cy.get("#status").should("contain", "Ready");

    const ts = Date.now();
    const key = `hv:${ts}`;
    cy.get("#live-key").clear().type(key);
    // Ensure mutations target the same key
    cy.get("#key").clear().type(key);

    cy.get("#live-val-fp")
      .invoke("text")
      .should((t) => expect(t.trim()).to.not.equal("-"));

    cy.get("#live-val-fp")
      .invoke("text")
      .then((t) => cy.wrap(t.trim()).as("fp0"));

    const v1 = `v1-${ts}`;
    cy.get("#root")
      .invoke("text")
      .then((t) => cy.wrap(t.trim()).as("rootBefore1"));
    cy.get("#val").clear().type(v1);
    cy.get("#set").click();
    cy.get("@rootBefore1").then((rb) => {
      cy.get("#root")
        .invoke("text")
        .should((t) => expect(t.trim()).to.not.equal(rb));
    });
    cy.get("@fp0").then((fp0) => {
      cy.get("#live-val-fp")
        .invoke("text")
        .should((t) => expect(t.trim()).to.not.equal(fp0));
    });

    cy.get("#live-val-fp")
      .invoke("text")
      .then((t) => cy.wrap(t.trim()).as("fp1"));

    cy.get("#set").click();
    cy.get("@fp1").then((fp1) => {
      cy.get("#live-val-fp")
        .invoke("text")
        .should((t) => expect(t.trim()).to.equal(fp1));
    });

    const v2 = `${v1}-x`;
    cy.get("#val").clear().type(v2);
    cy.get("#set").click();
    cy.get("@fp1").then((fp1) => {
      cy.get("#live-val-fp")
        .invoke("text")
        .should((t) => expect(t.trim()).to.not.equal(fp1));
    });
  });

  it("switching live keys reflects different content and switching back restores prior fingerprint", () => {
    cy.visit("/");
    cy.get("#status").should("contain", "Ready");

    const k1 = `hv1a:${Date.now()}`;
    const k2 = `hv1b:${Date.now()}`;

    // Seed distinct values under k1 and k2
    cy.get("#key").clear().type(k1);
    cy.get("#val").clear().type("v1");
    cy.get("#set").click();
    cy.get("#key").clear().type(k2);
    cy.get("#val").clear().type("v2");
    cy.get("#set").click();

    // Subscribe to k1
    cy.get("#live-key").clear().type(k1);
    cy.get("#live-val-fp")
      .invoke("text")
      .then((t) => cy.wrap(t.trim()).as("k1fp"));

    // Switch to k2 -> fingerprint differs
    cy.get("#live-key").clear().type(k2);
    cy.get("@k1fp").then((fp1) => {
      cy.get("#live-val-fp")
        .invoke("text")
        .should((t) => expect(t.trim()).to.not.equal(fp1));
    });

    // Switch back to k1 -> original fingerprint
    cy.get("#live-key").clear().type(k1);
    cy.get("@k1fp").then((fp1) => {
      cy.get("#live-val-fp")
        .invoke("text")
        .should((t) => expect(t.trim()).to.equal(fp1));
    });
  });

  it("undo/redo reverts and reapplies the live value fingerprint", () => {
    cy.visit("/");
    cy.get("#status").should("contain", "Ready");

    const key = `hv2:${Date.now()}`;
    cy.get("#live-key").clear().type(key);
    cy.get("#key").clear().type(key);

    // Write v1 and wait for commit
    cy.get("#root")
      .invoke("text")
      .then((t) => cy.wrap(t.trim()).as("rootBefore1"));
    cy.get("#val").clear().type("v1");
    cy.get("#set").click();
    cy.get("@rootBefore1").then((rb) => {
      cy.get("#root")
        .invoke("text")
        .should((t) => expect(t.trim()).to.not.equal(rb));
    });
    cy.get("#live-val-fp")
      .invoke("text")
      .then((t) => cy.wrap(t.trim()).as("fp1"));

    // Write v2 and wait for commit
    cy.get("#root")
      .invoke("text")
      .then((t) => cy.wrap(t.trim()).as("rootBefore2"));
    cy.get("#val").clear().type("v2");
    cy.get("#set").click();
    cy.get("@rootBefore2").then((rb) => {
      cy.get("#root")
        .invoke("text")
        .should((t) => expect(t.trim()).to.not.equal(rb));
    });
    cy.get("#live-val-fp")
      .invoke("text")
      .then((t) => cy.wrap(t.trim()).as("fp2"));

    cy.get("#undo").click();
    // After undo, fingerprint should equal fp1 (allowing extra time for subscription update)
    cy.get("@fp1").then((fp1) => {
      cy.get("#live-val-fp", { timeout: 10000 })
        .invoke("text")
        .should((t) => expect(t.trim()).to.equal(fp1));
    });
    cy.get("#redo").click();
    cy.get("@fp2").then((fp2) => {
      cy.get("#live-val-fp", { timeout: 10000 })
        .invoke("text")
        .should((t) => expect(t.trim()).to.equal(fp2));
    });
  });

  it("treats empty string as valid content for fingerprinting", () => {
    cy.visit("/");
    cy.get("#status").should("contain", "Ready");

    const key = `hv3:${Date.now()}`;
    cy.get("#live-key").clear().type(key);
    cy.get("#key").clear().type(key);

    // Set empty string by clearing input only (Cypress cannot type empty string)
    cy.get("#val").clear();
    cy.get("#set").click();
    cy.get("#live-val-fp")
      .invoke("text")
      .then((t) => cy.wrap(t.trim()).as("fpEmpty"));

    cy.get("#set").click();
    cy.get("@fpEmpty").then((fp) => {
      cy.get("#live-val-fp")
        .invoke("text")
        .should((t) => expect(t.trim()).to.equal(fp));
    });

    cy.get("#val").clear().type("x");
    cy.get("#set").click();
    cy.get("@fpEmpty").then((fp) => {
      cy.get("#live-val-fp")
        .invoke("text")
        .should((t) => expect(t.trim()).to.not.equal(fp));
    });
  });

  it("deleting the live key returns fingerprint to missing state", () => {
    cy.visit("/");
    cy.get("#status").should("contain", "Ready");

    const key = `hv4:${Date.now()}`;
    cy.get("#live-key").clear().type(key);
    cy.get("#key").clear().type(key);

    cy.get("#val").clear().type("to-del");
    cy.get("#set").click();
    cy.get("#live-val-fp")
      .invoke("text")
      .then((t) => cy.wrap(t.trim()).as("fpSet"));

    cy.get("#ops-json")
      .clear()
      .type(JSON.stringify({ del: [key] }), {
        parseSpecialCharSequences: false,
      });
    cy.get("#mutate").click();

    cy.get("@fpSet").then((fpBefore) => {
      cy.get("#live-val-fp")
        .invoke("text")
        .should((t) => expect(t.trim()).to.not.equal(fpBefore));
    });
  });
});
