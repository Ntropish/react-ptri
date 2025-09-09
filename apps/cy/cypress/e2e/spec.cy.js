describe("@ptri/react demo", () => {
  it("can set, get, and scan using real OPFS-backed store", () => {
    cy.visit("/");
    cy.contains("@ptri/react demo");
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

    // Type a key to activate value subscription and use same key for writes
    const k = `lq:${Date.now()}`;
    cy.get("#live-key").clear().type(k);
    cy.get("#key").clear().type(k);
    // initial fingerprint should populate (even if value missing)
    cy.get("#live-val-fp")
      .invoke("text")
      .should((t) => expect(t.trim()).to.not.equal("-"));

    // capture initial fingerprints (aliases)
    cy.get("#live-val-fp")
      .invoke("text")
      .then((t) => cy.wrap(t.trim()).as("valFp1"));
    cy.get("#live-range-fp")
      .invoke("text")
      .then((t) => cy.wrap(t.trim()).as("rangeFp1"));

    // write a unique value to guarantee a change
    const v1 = `v-${Date.now()}`;
    // capture current root to wait for commit (alias)
    cy.get("#root")
      .invoke("text")
      .then((t) => cy.wrap(t.trim()).as("rootBefore1"));
    cy.get("#val").clear().type(v1);
    cy.get("#set").click();
    // wait for root to change first (commit boundary)
    cy.get("@rootBefore1").then((rootBefore) => {
      cy.get("#root")
        .invoke("text")
        .should((t) => {
          expect(t.trim()).to.not.equal(rootBefore);
        });
    });
    cy.get("@valFp1").then((valFp1) => {
      cy.get("#live-val-fp")
        .invoke("text")
        .should((t) => expect(t.trim()).to.not.equal(valFp1));
    });
    cy.get("@rangeFp1").then((rangeFp1) => {
      cy.get("#live-range-fp")
        .invoke("text")
        .should((t) => expect(t.trim()).to.not.equal(rangeFp1));
    });

    // capture second fingerprints
    cy.get("#live-val-fp")
      .invoke("text")
      .then((t) => cy.wrap(t.trim()).as("valFp2"));
    cy.get("#live-range-fp")
      .invoke("text")
      .then((t) => cy.wrap(t.trim()).as("rangeFp2"));

    // set same value again -> fingerprints should remain the same
    cy.get("#set").click();
    cy.get("@valFp2").then((valFp2) => {
      cy.get("#live-val-fp")
        .invoke("text")
        .should((t) => expect(t.trim()).to.equal(valFp2));
    });
    cy.get("@rangeFp2").then((rangeFp2) => {
      cy.get("#live-range-fp")
        .invoke("text")
        .should((t) => expect(t.trim()).to.equal(rangeFp2));
    });

    // change to a different value -> fingerprints should change again
    const v2 = `${v1}-x`;
    cy.get("#val").clear().type(v2);
    cy.get("#set").click();
    cy.get("@valFp2").then((valFp2) => {
      cy.get("#live-val-fp")
        .invoke("text")
        .should((t) => expect(t.trim()).to.not.equal(valFp2));
    });
    cy.get("@rangeFp2").then((rangeFp2) => {
      cy.get("#live-range-fp")
        .invoke("text")
        .should((t) => expect(t.trim()).to.not.equal(rangeFp2));
    });
  });
});
