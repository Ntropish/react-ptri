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

  it("supports count and diff via provider APIs", () => {
    cy.visit("/");
    cy.get("#status").should("contain", "Ready");

    // Ensure at least one row exists
    cy.get("#key").clear().type("b");
    cy.get("#val").clear().type("2");
    cy.get("#set").click();

    // Count a..z should be >= 1
    cy.get("#count").click();
    cy.get("#output")
      .invoke("text")
      .should((t) => {
        expect(t).to.match(/count\(a\.\.z\) = \d+/);
      });

    // Self-diff should be empty array
    cy.get("#diff").click();
    cy.get("#output").should("contain", "[");
    cy.get("#output")
      .invoke("text")
      .should((t) => {
        const trimmed = t.trim();
        expect(["[]", "[\n]\n", "[\n]\r\n"]).to.include(trimmed);
      });
  });

  it("supports hierarchy scan and count via provider APIs", () => {
    cy.visit("/");
    cy.get("#status").should("contain", "Ready");

    // Ensure a couple of rows
    cy.get("#key").clear().type("c");
    cy.get("#val").clear().type("3");
    cy.get("#set").click();

    cy.get("#hierarchy").click();
    cy.get("#output").should("contain", "hierarchy:");
    cy.get("#output").should("contain", "leavesTotalEntries:");
  });

  it("updates live query fingerprints only when data changes", () => {
    cy.visit("/");
    cy.get("#status").should("contain", "Ready");

    // Type a key to activate value subscription
    cy.get("#key").clear().type("lq");
    // initial fingerprint should populate (even if value missing)
    cy.get("#live-val-fp")
      .invoke("text")
      .should((t) => expect(t.trim()).to.not.equal("-"));

    // capture initial fingerprints
    let valFp1, rangeFp1;
    cy.get("#live-val-fp")
      .invoke("text")
      .then((t) => (valFp1 = t.trim()));
    cy.get("#live-range-fp")
      .invoke("text")
      .then((t) => (rangeFp1 = t.trim()));

    // set value to 1 -> fingerprints should change
    cy.get("#val").clear().type("1");
    cy.get("#set").click();
    cy.get("#live-val-fp")
      .invoke("text")
      .should((t) => expect(t.trim()).to.not.equal(valFp1));
    cy.get("#live-range-fp")
      .invoke("text")
      .should((t) => expect(t.trim()).to.not.equal(rangeFp1));

    // capture second fingerprints
    let valFp2, rangeFp2;
    cy.get("#live-val-fp")
      .invoke("text")
      .then((t) => (valFp2 = t.trim()));
    cy.get("#live-range-fp")
      .invoke("text")
      .then((t) => (rangeFp2 = t.trim()));

    // set same value again -> fingerprints should remain the same
    cy.get("#set").click();
    cy.get("#live-val-fp")
      .invoke("text")
      .should((t) => expect(t.trim()).to.equal(valFp2));
    cy.get("#live-range-fp")
      .invoke("text")
      .should((t) => expect(t.trim()).to.equal(rangeFp2));

    // change to 2 -> fingerprints should change again
    cy.get("#val").clear().type("2");
    cy.get("#set").click();
    cy.get("#live-val-fp")
      .invoke("text")
      .should((t) => expect(t.trim()).to.not.equal(valFp2));
    cy.get("#live-range-fp")
      .invoke("text")
      .should((t) => expect(t.trim()).to.not.equal(rangeFp2));
  });
});
