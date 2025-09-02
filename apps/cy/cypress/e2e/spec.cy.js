describe("react-ptri demo", () => {
  it("can set, get, and scan using real OPFS-backed store", () => {
    cy.visit("/");
    cy.contains("react-ptri demo");
    cy.get("#status").should("contain", "Ready");

    // initial root is shown
    cy.get("#root")
      .invoke("text")
      .should("match", /[a-f0-9]{64}|.*/);

    // set a value
    cy.get("#key").clear().type("a");
    cy.get("#val").clear().type("1");
    cy.get("#set").click();
    cy.get("#output").should("contain", '"op": "set"');

    // get it back
    cy.get("#get").click();
    cy.get("#output").should("contain", "1");

    // scan a..z should include our row
    cy.get("#scan").click();
    cy.get("#output").should("contain", "a");
  });

  it("supports undo and redo of mutations", () => {
    cy.visit("/");
    cy.get("#status").should("contain", "Ready");

    // set a=1
    cy.get("#key").clear().type("a");
    cy.get("#val").clear().type("1");
    cy.get("#set").click();
    cy.get("#get").click();
    cy.get("#output").should("contain", "1");

    // set a=2
    cy.get("#val").clear().type("2");
    cy.get("#set").click();
    cy.get("#get").click();
    cy.get("#output").should("contain", "2");

    // undo -> should see 1
    cy.get("#undo").click();
    cy.get("#get").click();
    cy.get("#output").should("contain", "1");

    // redo -> should see 2
    cy.get("#redo").click();
    cy.get("#get").click();
    cy.get("#output").should("contain", "2");
  });
});
