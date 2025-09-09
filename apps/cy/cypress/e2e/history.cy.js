describe("react-ptri history APIs", () => {
  it("exposes history offset, can page undo/redo stacks, and supports checkout with undo", () => {
    cy.visit("/");
    cy.get("#status").should("contain", "Ready");

    // Seed two commits with unique keys; wait for commits via root hash change
    const ts = Date.now();
    const k1 = `h1:${ts}`;
    const k2 = `h2:${ts}`;

    // Commit 1
    cy.get("#root")
      .invoke("text")
      .then((t) => cy.wrap(t.trim()).as("root0"));
    cy.get("#key").clear().type(k1);
    cy.get("#val").clear().type("v1", { parseSpecialCharSequences: false });
    cy.get("#set").click();
    cy.get("@root0").then((r0) => {
      cy.get("#root")
        .invoke("text")
        .should((t) => expect(t.trim()).to.not.equal(r0));
    });
    cy.get("#root")
      .invoke("text")
      .then((t) => cy.wrap(t.trim()).as("root1"));

    // Commit 2 (head)
    cy.get("#key").clear().type(k2);
    cy.get("#val").clear().type("v2", { parseSpecialCharSequences: false });
    cy.get("#set").click();
    cy.get("@root1").then((r1) => {
      cy.get("#root")
        .invoke("text")
        .should((t) => expect(t.trim()).to.not.equal(r1));
    });
    cy.get("#root")
      .invoke("text")
      .then((t) => cy.wrap(t.trim()).as("root2"));

    // At head => history offset should be 0 and redo stack empty
    cy.get("#history-offset")
      .invoke("text")
      .should((t) => expect(parseInt(t.trim(), 10)).to.equal(0));
    cy.get("#hist-scan-offset").clear().type("0");
    cy.get("#hist-scan-limit").clear().type("10");
    cy.get("#hist-scan-reverse").uncheck();
    cy.get("#hist-scan").click();
    cy.get("#history-output")
      .invoke("text")
      .then((txt) => {
        const res = JSON.parse(txt.trim());
        expect(res.total).to.equal(0);
        expect(Array.isArray(res.data)).to.equal(true);
      });

    // Undo once => offset > 0 and redo stack should have at least 1
    cy.get("#undo").click();
    cy.get("@root1").then((r1) => {
      cy.get("#root", { timeout: 10000 })
        .invoke("text")
        .should((t) => expect(t.trim()).to.equal(r1));
    });
    cy.get("#history-offset")
      .invoke("text")
      .should((t) => expect(parseInt(t.trim(), 10)).to.be.greaterThan(0));

    // Scan redo-direction (newer commits)
    cy.get("#hist-scan-offset").clear().type("0");
    cy.get("#hist-scan-limit").clear().type("10");
    cy.get("#hist-scan-reverse").uncheck(); // redo direction
    cy.get("#hist-scan").click();
    cy.get("#history-output")
      .invoke("text")
      .then((txt) => {
        const res = JSON.parse(txt.trim());
        expect(res.total).to.be.greaterThan(0);
        expect(res.data.length).to.be.greaterThan(0);
        // redo list should include the head we just came from
        cy.get("@root2").then((r2) => {
          expect(res.data).to.include(r2);
        });
      });

    // Scan undo-direction (older commits)
    cy.get("#hist-scan-reverse").check(); // undo direction
    cy.get("#hist-scan").click();
    cy.get("#history-output")
      .invoke("text")
      .then((txt) => {
        const res = JSON.parse(txt.trim());
        expect(res.total).to.be.greaterThan(0);
        expect(res.data.length).to.be.greaterThan(0);
        expect(typeof res.data[0]).to.equal("string");
        cy.wrap(res.data[0]).as("older1"); // newest older commit
      });

    // Checkout to the newest-older commit; this appends to history and moves head
    cy.get("#checkout-root").clear();
    cy.get("@older1").then((olderHash) => {
      cy.get("#checkout-root").type(String(olderHash));
    });
    cy.get("#checkout").click();
    cy.get("@older1").then((olderHash) => {
      cy.get("#root", { timeout: 10000 })
        .invoke("text")
        .should((t) => expect(t.trim()).to.equal(String(olderHash)));
    });

    // After checkout we are at head of timeline again
    cy.get("#history-offset")
      .invoke("text")
      .should((t) => expect(parseInt(t.trim(), 10)).to.equal(0));

  // Undo the checkout => should revert to the pre-checkout current (root1)
    cy.get("#undo").click();
  cy.get("@root1").then((r1) => {
      cy.get("#root", { timeout: 10000 })
    .invoke("text")
    .should((t) => expect(t.trim()).to.equal(r1));
    });

    // Redo stack should now include the checkout commit
    cy.get("#hist-scan-reverse").uncheck(); // redo direction
    cy.get("#hist-scan").click();
    cy.get("#history-output")
      .invoke("text")
      .then((txt) => {
        const res = JSON.parse(txt.trim());
        expect(res.total).to.be.greaterThan(0);
        expect(res.data.length).to.be.greaterThan(0);
      });
  });
});
