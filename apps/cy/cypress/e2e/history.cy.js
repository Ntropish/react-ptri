describe("@ptri/react history APIs", () => {
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

  it("supports scanning and paging over history in both directions after 20+ commits (limit=10)", () => {
    cy.visit("/");
    cy.get("#status").should("contain", "Ready");

    const ts = Date.now();
    const ns = `hp:${ts}:`;

    // Baseline undo total
    cy.get("#hist-scan-offset").clear().type("0");
    cy.get("#hist-scan-limit").clear().type("1000");
    cy.get("#hist-scan-reverse").check();
    cy.get("#hist-scan").click();
    cy.get("#history-output")
      .invoke("text")
      .then((txt) => {
        const res = JSON.parse(txt.trim());
        cy.wrap(res.total).as("baselineUndoTotal");
      });

    const commit = (i) => {
      cy.get("#root")
        .invoke("text")
        .then((t) => cy.wrap(t.trim()).as(`before${i}`));
      cy.get("#key").clear().type(`${ns}${i}`);
      cy.get("#val")
        .clear()
        .type(`v${i}`, { parseSpecialCharSequences: false });
      cy.get("#set").click();
      cy.get(`@before${i}`).then((b) => {
        cy.get("#root")
          .invoke("text")
          .should((t) => expect(t.trim()).to.not.equal(b));
      });
    };

    // Make 20 commits
    for (let i = 0; i < 20; i++) commit(i);

    // Verify undo-direction total increased by at least 20
    cy.get("#hist-scan-offset").clear().type("0");
    cy.get("#hist-scan-limit").clear().type("1000");
    cy.get("#hist-scan-reverse").check(); // undo direction
    cy.get("#hist-scan").click();
    cy.get("#history-output")
      .invoke("text")
      .then((txt) => {
        const res = JSON.parse(txt.trim());
        cy.get("@baselineUndoTotal").then((base) => {
          expect(res.total).to.be.greaterThan(Number(base) + 19);
        });
      });

    // Page through with limit 10: page 1
    cy.get("#hist-scan-offset").clear().type("0");
    cy.get("#hist-scan-limit").clear().type("10");
    cy.get("#hist-scan").click();
    cy.get("#history-output")
      .invoke("text")
      .then((txt) => {
        const res = JSON.parse(txt.trim());
        expect(res.data.length).to.equal(10);
        cy.wrap(res.data).as("page1");
      });

    // Next page
    cy.get("#hist-scan-offset").clear().type("10");
    cy.get("#hist-scan-limit").clear().type("10");
    cy.get("#hist-scan").click();
    cy.get("#history-output")
      .invoke("text")
      .then((txt) => {
        const res = JSON.parse(txt.trim());
        // We created 20, so expect a full second page
        expect(res.data.length).to.equal(10);
        cy.get("@page1").then((p1) => {
          const set = new Set([...(p1 || []), ...res.data]);
          expect(set.size).to.equal(20);
        });
      });

    // Undo 20 to build a redo stack of at least 20
    for (let i = 0; i < 20; i++) {
      cy.get("#undo").should("not.be.disabled").click();
    }
    cy.get("#history-offset")
      .invoke("text")
      .should((t) => expect(parseInt(t.trim(), 10)).to.be.greaterThan(0));

    // Redo-direction page 1
    cy.get("#hist-scan-reverse").uncheck(); // redo direction
    cy.get("#hist-scan-offset").clear().type("0");
    cy.get("#hist-scan-limit").clear().type("10");
    cy.get("#hist-scan").click();
    cy.get("#history-output")
      .invoke("text")
      .then((txt) => {
        const res = JSON.parse(txt.trim());
        expect(res.total).to.be.greaterThan(0);
        expect(res.data.length).to.equal(10);
        cy.wrap(res.data).as("redoPage1");
      });

    // Redo-direction page 2
    cy.get("#hist-scan-offset").clear().type("10");
    cy.get("#hist-scan-limit").clear().type("10");
    cy.get("#hist-scan").click();
    cy.get("#history-output")
      .invoke("text")
      .then((txt) => {
        const res = JSON.parse(txt.trim());
        expect(res.data.length).to.equal(10);
        cy.get("@redoPage1").then((p1) => {
          const set = new Set([...(p1 || []), ...res.data]);
          expect(set.size).to.equal(20);
        });
      });
  });
});
