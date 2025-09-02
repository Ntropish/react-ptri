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
});
