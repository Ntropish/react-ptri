const { faker } = require("@faker-js/faker");

describe("@ptri/react workflow", () => {
  it("creates a user and orders, verifies counts/scan, uses undo/redo, and checks live fingerprints", () => {
    cy.visit("/");
    cy.get("#status").should("contain", "Ready");

    // Activate value subscription by setting a key early
    const uid = faker.string.alphanumeric({ length: 6, casing: "lower" });
    const userKey = `user:${uid}`;
    const orderKeys = [0, 1, 2].map((i) => `order:${uid}:${i}`);

    // Capture initial live range fingerprint and count
    cy.get("#live-range-fp")
      .invoke("text")
      .then((t) => cy.wrap(t.trim()).as("rangeFp0"));
    cy.get("#count").click();
    cy.get("#output")
      .invoke("text")
      .then((txt) => {
        const m = txt.match(/count\(a\.\.z\) = (\d+)/);
        const n0 = m ? parseInt(m[1], 10) : 0;
        cy.wrap(n0).as("count0");
      });

    // Prepare user payload and set it
    const name = faker.person.fullName();
    const email = faker.internet.email({ firstName: name.split(" ")[0] });
    const userVal = JSON.stringify({ name, email });
    cy.get("#key").clear().type(userKey);
    cy.get("#val").clear().type(userVal, { parseSpecialCharSequences: false });
    // capture root before batch
    cy.get("#root")
      .invoke("text")
      .then((t) => cy.wrap(t.trim()).as("rootBeforeBatch"));
    cy.get("#set").click();

    // Create 3 orders
    orderKeys.forEach((k, i) => {
      const amount = faker.number.int({ min: 10, max: 500 });
      const item = faker.commerce.product();
      const val = JSON.stringify({ item, amount, i });
      cy.get("#key").clear().type(k);
      cy.get("#val").clear().type(val, { parseSpecialCharSequences: false });
      cy.get("#set").click();
    });

    // Ensure commit boundary: root changes after batch
    cy.get("@rootBeforeBatch").then((rb) => {
      cy.get("#root")
        .invoke("text")
        .should((t) => expect(t.trim()).to.not.equal(rb));
    });

    // Scan should include our user and at least one order
    cy.get("#scan").click();
    cy.get("#output").should("contain", userKey);
    cy.get("#output").should("contain", `order:${uid}:`);

    // Count should have increased by at least 4 (1 user + 3 orders)
    cy.get("#count").click();
    cy.get("#output")
      .invoke("text")
      .then((txt) => {
        const m = txt.match(/count\(a\.\.z\) = (\d+)/);
        const n1 = m ? parseInt(m[1], 10) : 0;
        cy.get("@count0").then((n0) => {
          expect(n1).to.be.gte(Number(n0) + 4);
        });
      });

    // Live fingerprints should reflect the batch write
    cy.get("@rangeFp0").then((fp0) => {
      cy.get("#live-range-fp")
        .invoke("text")
        .should((t) => expect(t.trim()).to.not.equal(fp0));
    });

    // Get the user record and verify name is present
    cy.get("#key").clear().type(userKey);
    cy.get("#get").click();
    cy.get("#output").should("contain", name.split(" ")[0]);

    // Capture count after writes
    cy.get("#count").click();
    cy.get("#output")
      .invoke("text")
      .then((txt) => {
        const m = txt.match(/count\(a\.\.z\) = (\d+)/);
        const after = m ? parseInt(m[1], 10) : 0;
        cy.wrap(after).as("countAfter");
      });

    // Undo the last mutation (last order) -> count decreases by 1
    cy.get("#undo").click();
    cy.get("#count").click();
    cy.get("#output")
      .invoke("text")
      .then((txt) => {
        const m = txt.match(/count\(a\.\.z\) = (\d+)/);
        const n = m ? parseInt(m[1], 10) : 0;
        cy.get("@countAfter").then((after) => {
          expect(n).to.equal(Number(after) - 1);
        });
      });

    // Redo -> count returns
    cy.get("#redo").click();
    cy.get("#count").click();
    cy.get("#output")
      .invoke("text")
      .then((txt) => {
        const m = txt.match(/count\(a\.\.z\) = (\d+)/);
        const n = m ? parseInt(m[1], 10) : 0;
        cy.get("@countAfter").then((after) => {
          expect(n).to.equal(Number(after));
        });
      });

    // Hierarchy summary should be present
    cy.get("#hierarchy").click();
    cy.get("#output").should("contain", "hierarchy:");
    cy.get("#output").should("contain", "leavesTotalEntries:");
  });
});
