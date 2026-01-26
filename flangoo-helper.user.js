// ==UserScript==
// @name        Flangoo Helper
// @description A userscript that bypasses Flangoo's activity monitoring and provides correct answers
// @match       *://*.flangoo.com/reader/*
// @run-at      document-start
// @grant       none
// ==/UserScript==

(function () {
    "use strict";

    // --- 1. THE "HASFOCUS" BYPASS ---
    // Flangoo's source code: if (!document.hasFocus()) { ... }
    // We overwrite this function to ALWAYS return true.
    // This effectively blinds their intervalTimer.

    // Save original just in case, but we likely won't need it.
    const originalHasFocus = document.hasFocus;

    // Overwrite on the document instance
    document.hasFocus = function() {
        // console.log("[Flangoo Helper] Flangoo checked focus -> Returned TRUE");
        return true;
    };

    // Also try to overwrite on the prototype to be safe
    try {
        Object.defineProperty(Document.prototype, 'hasFocus', {
            value: () => true,
            writable: true,
            configurable: true
        });
    } catch (e) { }

    // --- 2. IDLE TIME RESETTER ---
    // Flangoo's source code: if (idleTime >= 300) ...
    // We dispatch a fake event every 60 seconds to reset this counter.
    setInterval(() => {
        document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true }));
        document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true }));
        // console.log("[Flangoo Helper] Reset idle timer");
    }, 60000);


    // --- 3. STATE MANAGEMENT ---
    const state = {
        answers: {}, // QuestionID -> AnswerID
        loopRunning: false
    };

    // --- 4. NETWORK INTERCEPTOR (Get Answers) ---
    const origFetch = window.fetch;
    window.fetch = async (...args) => {
        const url = args[0];
        const response = await origFetch(...args);

        if (typeof url === "string" && url.includes("api.flangoo.com/graphql")) {
            try {
                const clone = response.clone();
                const data = await clone.json();
                if (data?.data?.bookQuestions) {
                    data.data.bookQuestions.forEach((q) => {
                        const correctOpt = q.options?.find((o) => o.accepted === true);
                        if (correctOpt && q.id) {
                            state.answers[String(q.id)] = String(correctOpt.id);
                        }
                    });
                    // console.log(`[Flangoo Helper] Answers loaded: ${Object.keys(state.answers).length}`);
                }
            } catch (e) {}
        }
        return response;
    };

    // --- 5. HELPER: BUTTON FINDER ---
    function findBtn(textOrSelector) {
        // Try selector first (fastest)
        let btn = document.querySelector(textOrSelector);
        if (btn && btn.offsetParent !== null) return btn;

        // Fallback to text search
        const allBtns = document.querySelectorAll("button, .btn");
        for (const b of allBtns) {
            if (b.offsetParent === null || b.disabled) continue;
            if (b.textContent.toLowerCase().includes(textOrSelector.toLowerCase())) return b;
        }
        return null;
    }

    // --- 6. THE LOGIC LOOP ---
    function gameLoop() {
        requestAnimationFrame(gameLoop);

        // --- PRIORITY 1: NEXT BUTTON ---
        // If "Next" is there, we are done. Click it.
        const nextBtn = findBtn("Next");
        if (nextBtn) {
            nextBtn.click();
            return;
        }

        // --- PRIORITY 2: FIND QUESTIONS ---
        const options = Array.from(document.querySelectorAll(".option_btn, button[data-value]"));
        if (options.length === 0) return; // No quiz visible

        // Find the correct answer ID for the current visible question
        // We look at the first option to find the question ID if possible,
        // or just brute force check against our answer list.
        let targetBtn = null;
        const correctValues = Object.values(state.answers);

        for (const opt of options) {
            const val = String(opt.getAttribute("data-value"));
            if (correctValues.includes(val)) {
                targetBtn = opt;
                break;
            }
        }

        if (!targetBtn) return; // We don't know the answer yet

        // --- PRIORITY 3: CHECK STATUS ---
        // Is the correct answer ALREADY selected?
        const isSelected = targetBtn.classList.contains("selected") ||
                           targetBtn.classList.contains("active") ||
                           targetBtn.style.backgroundColor === "rgb(76, 175, 80)"; // Green

        if (!isSelected) {
            // STEP A: If not selected, CLICK THE ANSWER
            // (We explicitly ignore the submit button here)
            targetBtn.click();

            // Force events for React/Frameworks
            targetBtn.dispatchEvent(new MouseEvent("mousedown", {bubbles:true}));
            targetBtn.dispatchEvent(new MouseEvent("mouseup", {bubbles:true}));
        } else {
            // STEP B: If (and ONLY if) it is selected, CLICK SUBMIT
            // We use the specific class you gave: .btn-success
            const submitBtn = document.querySelector(".btn-success") || findBtn("Submit Answer") || findBtn("Check");

            if (submitBtn) {
                submitBtn.click();
                submitBtn.dispatchEvent(new MouseEvent("mousedown", {bubbles:true}));
                submitBtn.dispatchEvent(new MouseEvent("mouseup", {bubbles:true}));
            }
        }
    }

    // --- 7. START ---
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => requestAnimationFrame(gameLoop));
    } else {
        requestAnimationFrame(gameLoop);
    }

    // console.log("Flangoo Helper Loaded");

})();