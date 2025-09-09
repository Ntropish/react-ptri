describe("usePtriRange hook (with isolated inputs)", () => {
  it("updates range fingerprint only when data in the live range changes", () => {
    cy.visit("/");
    cy.get("#status").should("contain", "Ready");

    // Capture initial range fingerprint
    cy.get("#live-range-fp")
      .invoke("text")
      .then((t) => cy.wrap(t.trim()).as("rfp0"));

    // Write a unique key within the default live range a..z and ensure commit
    const ts = Date.now();
    const key = `r:${ts}`; // starts with 'r' so it's in range
    const val1 = `rv1-${ts}`;
    cy.get("#key").clear().type(key);
    cy.get("#root")
      .invoke("text")
      .then((t) => cy.wrap(t.trim()).as("rootBefore"));
    cy.get("#val").clear().type(val1, { parseSpecialCharSequences: false });
    cy.get("#set").click();
    cy.get("@rootBefore").then((rb) => {
      cy.get("#root")
        .invoke("text")
        .should((t) => expect(t.trim()).to.not.equal(rb));
    });

    // Range fingerprint should change
    cy.get("@rfp0").then((rfp0) => {
      cy.get("#live-range-fp")
        .invoke("text")
        .should((t) => expect(t.trim()).to.not.equal(rfp0));
    });

    // Capture range fingerprint 1
    cy.get("#live-range-fp")
      .invoke("text")
      .then((t) => cy.wrap(t.trim()).as("rfp1"));

    // Set same value again -> range fingerprint should remain the same
    cy.get("#set").click();
    cy.get("@rfp1").then((rfp1) => {
      cy.get("#live-range-fp")
        .invoke("text")
        .should((t) => expect(t.trim()).to.equal(rfp1));
    });

    // Change the value -> fingerprint should change
    const val2 = `${val1}-x`;
    cy.get("#val").clear().type(val2, { parseSpecialCharSequences: false });
    cy.get("#set").click();
    cy.get("@rfp1").then((rfp1) => {
      cy.get("#live-range-fp")
        .invoke("text")
        .should((t) => expect(t.trim()).to.not.equal(rfp1));
    });
  });

  it("changing live range options (start/end inclusive, reverse, offset/limit) impacts fingerprint deterministically", () => {
    cy.visit("/");
    cy.get("#status").should("contain", "Ready");

    // Seed a few keys
    const ts = Date.now();
    const rows = [
      { k: `a:${ts}`, v: "1" },
      { k: `b:${ts}`, v: "2" },
      { k: `c:${ts}`, v: "3" },
      { k: `d:${ts}`, v: "4" },
    ];
    rows.forEach(({ k, v }) => {
      cy.get("#key").clear().type(k);
      cy.get("#val").clear().type(v);
      cy.get("#set").click();
    });

    // Default options capture full live range a..z
    cy.get("#live-range-fp")
      .invoke("text")
      .then((t) => cy.wrap(t.trim()).as("fpAll"));

    // Limit=2 changes fingerprint due to fewer rows
    cy.get("#live-scan-limit").clear().type("2");
    cy.get("#scan").click(); // cause UI update; not strictly needed for fp
    cy.get("@fpAll").then((fp) => {
      cy.get("#live-range-fp")
        .invoke("text")
        .should((t) => expect(t.trim()).to.not.equal(fp));
    });

    // Offset=1 with same limit should change again
    cy.get("#live-scan-offset").clear().type("1");
    cy.get("#scan").click();
    cy.get("#live-range-fp")
      .invoke("text")
      .then((t) => cy.wrap(t.trim()).as("fpOff1Lim2"));

    // Reverse toggling should alter order-sensitive fingerprints if they include ordering
    cy.get("#live-scan-reverse").click();
    cy.get("@fpOff1Lim2").then((prev) => {
      cy.get("#live-range-fp")
        .invoke("text")
        .should((t) => expect(t.trim()).to.not.equal(prev));
    });

    // change start/end bounds to narrow set
    cy.get("#live-scan-start").clear().type("b");
    cy.get("#live-scan-end").clear().type("c");
    cy.get("#live-scan-offset").clear();
    cy.get("#live-scan-limit").clear();
    cy.get("#live-scan-reverse").check(); // ensure reverse stays on (click may toggle)
    cy.get("#scan").click();
    cy.get("#live-range-fp")
      .invoke("text")
      .then((t) => cy.wrap(t.trim()).as("fpBc"));

    // Toggle inclusivity should impact fingerprint at boundaries
    cy.get("#live-scan-start-inclusive").click();
    cy.get("@fpBc").then((prev) => {
      cy.get("#live-range-fp")
        .invoke("text")
        .should((t) => expect(t.trim()).to.not.equal(prev));
    });
    cy.get("#live-scan-end-inclusive").click();
    cy.get("#live-range-fp")
      .invoke("text")
      .then((t) => cy.wrap(t.trim()).as("fpBcInc"));

    // Reset options for next tests
    cy.get("#live-scan-start").clear().type("a");
    cy.get("#live-scan-end").clear().type("z");
    cy.get("#live-scan-start-inclusive").check();
    cy.get("#live-scan-end-inclusive").check();
    cy.get("#live-scan-reverse").uncheck();
    cy.get("#live-scan-offset").clear();
    cy.get("#live-scan-limit").clear();
  });

  it("undo/redo of range-affecting writes updates the fingerprint accordingly", () => {
    cy.visit("/");
    cy.get("#status").should("contain", "Ready");

    const key = `rU:${Date.now()}`;
    cy.get("#key").clear().type(key);
    // Set v1 and wait for commit
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
    // Constrain live range to the exact key to avoid interference from other data
    cy.get("#live-scan-start").clear().type(key);
    cy.get("#live-scan-end").clear().type(key);
    cy.get("#live-scan-start-inclusive").check();
    cy.get("#live-scan-end-inclusive").check();
    cy.get("#live-scan-reverse").uncheck();
    cy.get("#live-scan-offset").clear();
    cy.get("#live-scan-limit").clear();
    // Capture root1 and fp1
    cy.get("#root")
      .invoke("text")
      .then((t) => cy.wrap(t.trim()).as("root1"));
    cy.get("#live-range-fp")
      .invoke("text")
      .then((t) => cy.wrap(t.trim()).as("fp1"));

    // Set v2 and wait for commit
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
    // Capture root2 and fp2
    cy.get("#root")
      .invoke("text")
      .then((t) => cy.wrap(t.trim()).as("root2"));
    cy.get("#live-range-fp")
      .invoke("text")
      .then((t) => cy.wrap(t.trim()).as("fp2"));

    cy.get("#undo").click();
    // Wait for root to equal root1
    cy.get("@root1").then((r1) => {
      cy.get("#root", { timeout: 10000 })
        .invoke("text")
        .should((t) => expect(t.trim()).to.equal(r1));
    });
    // After undo, fingerprint should equal fp1
    cy.get("@fp1").then((fp1) => {
      cy.get("#live-range-fp", { timeout: 10000 })
        .invoke("text")
        .should((t) => expect(t.trim()).to.equal(fp1));
    });

    cy.get("#redo").click();
    // Wait for root to equal root2
    cy.get("@root2").then((r2) => {
      cy.get("#root", { timeout: 10000 })
        .invoke("text")
        .should((t) => expect(t.trim()).to.equal(r2));
    });
    // After redo, fingerprint should equal fp2
    cy.get("@fp2").then((fp2) => {
      cy.get("#live-range-fp", { timeout: 10000 })
        .invoke("text")
        .should((t) => expect(t.trim()).to.equal(fp2));
    });
  });

  it("deleting keys updates the range fingerprint to reflect removed rows", () => {
    cy.visit("/");
    cy.get("#status").should("contain", "Ready");

    const k = `rD:${Date.now()}`;
    cy.get("#key").clear().type(k);
    cy.get("#val").clear().type("1");
    cy.get("#set").click();
    cy.get("#live-range-fp")
      .invoke("text")
      .then((t) => cy.wrap(t.trim()).as("fpBeforeDel"));

    // Delete via batch ops
    cy.get("#ops-json")
      .clear()
      .type(JSON.stringify({ del: [k] }), {
        parseSpecialCharSequences: false,
      });
    cy.get("#mutate").click();

    cy.get("@fpBeforeDel").then((fpB) => {
      cy.get("#live-range-fp")
        .invoke("text")
        .should((t) => expect(t.trim()).to.not.equal(fpB));
    });
  });

  it("non-overlapping range changes do not affect the fingerprint", () => {
    cy.visit("/");
    cy.get("#status").should("contain", "Ready");

    // Set scan to a high range, then write outside it and ensure fingerprint stays unchanged
    cy.get("#live-scan-start").clear().type("x");
    cy.get("#live-scan-end").clear().type("z");
    cy.get("#live-scan-start-inclusive").check();
    cy.get("#live-scan-end-inclusive").check();
    cy.get("#live-scan-reverse").uncheck();

    cy.get("#live-range-fp")
      .invoke("text")
      .then((t) => cy.wrap(t.trim()).as("rfpHi"));

    // Write a key well below range
    const k = `a:${Date.now()}`;
    cy.get("#key").clear().type(k);
    cy.get("#val").clear().type("x");
    cy.get("#set").click();

    // Fingerprint should remain unchanged because write is out of range
    cy.get("@rfpHi").then((rfp) => {
      cy.get("#live-range-fp")
        .invoke("text")
        .should((t) => expect(t.trim()).to.equal(rfp));
    });

    // Reset live range controls
    cy.get("#live-scan-start").clear().type("a");
    cy.get("#live-scan-end").clear().type("z");
  });
});
