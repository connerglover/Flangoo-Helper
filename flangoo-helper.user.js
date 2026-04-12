// ==UserScript==
// @name        Flangoo Helper
// @description A userscript that bypasses Flangoo's activity monitoring and provides correct answers
// @match       *://*.flangoo.com/reader/*
// @run-at      document-start
// @grant       none
// ==/UserScript==

(function () {
    "use strict";

    // --- STATE MANAGEMENT ---
    const state = {
        answers: {}, // Stores QuestionID -> AnswerID
        lastAction: 0, // For debounce
    };

    // ==========================================
    // 1. ACTIVITY BYPASS
    // ==========================================

    function overrideActivityFunctions() {
        // console.log("[FH] Setting up activity monitoring overrides...");

        // Override global timer variables/functions
        window.setActive = () => {
            // console.log("[FH] setActive blocked");
            return true;
        };

        window.setActive_timer_toggle = () => {
            return true;
        };

        window.setIdleTime = () => {
            return 0;
        };

        // Override document.hasFocus (It's a function, not a property)
        const originalHasFocus = document.hasFocus;
        document.hasFocus = function () {
            return true;
        };

        // Override visibility API
        Object.defineProperty(document, "hidden", {
            get: function () {
                return false;
            },
            configurable: true,
        });

        Object.defineProperty(document, "visibilityState", {
            get: function () {
                return "visible";
            },
            configurable: true,
        });

        // Stop propagation of "away" events
        const stopEvent = (e) => {
            e.stopPropagation();
            // console.log(`[FH] Stopped ${e.type} event`);
        };

        window.addEventListener("visibilitychange", stopEvent, true);
        window.addEventListener("blur", stopEvent, true);
        window.addEventListener("focus", stopEvent, true);
        window.addEventListener("mouseleave", stopEvent, true);

        // console.log("[FH] Activity overrides active.");
    }

    // Simulate mouse movement (Original method)
    function simulateActivity() {
        const events = [
            new MouseEvent("mousemove", {
                bubbles: true,
                cancelable: true,
                view: window,
            }),
            new MouseEvent("mousedown", {
                bubbles: true,
                cancelable: true,
                view: window,
            }),
            new MouseEvent("mouseup", {
                bubbles: true,
                cancelable: true,
                view: window,
            }),
            new KeyboardEvent("keydown", {
                bubbles: true,
                cancelable: true,
                view: window,
            }),
            new KeyboardEvent("keyup", {
                bubbles: true,
                cancelable: true,
                view: window,
            }),
        ];

        setInterval(() => {
            const event = events[Math.floor(Math.random() * events.length)];
            document.dispatchEvent(event);
        }, 25000); // Slightly faster than original 30s to be safe
    }

    // ==========================================
    // 2. NETWORK INTERCEPTOR (Get Answers)
    // ==========================================
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
                    // console.log(`[FH] Answers loaded: ${Object.keys(state.answers).length}`,);
                }
            } catch (e) { }
        }
        return response;
    };

    // ==========================================
    // 3. QUIZ SOLVER
    // ==========================================

    function findBtn(textSelector) {
        // 1. Try generic button search
        const buttons = document.querySelectorAll("button, .btn");
        for (const btn of buttons) {
            if (btn.offsetParent !== null && !btn.disabled) {
                if (
                    btn.textContent.toLowerCase().includes(textSelector.toLowerCase())
                ) {
                    return btn;
                }
            }
        }
        return null;
    }

    function gameLoop() {
        requestAnimationFrame(gameLoop);

        // Debounce to prevent double-clicks (50ms)
        if (Date.now() - state.lastAction < 50) return;

        // --- STEP 1: NEXT BUTTON ---
        // If "Next" exists, click it immediately.
        const nextBtn = findBtn("Next");
        if (nextBtn) {
            //   console.log("[FH] Clicking Next");
            nextBtn.click();
            state.lastAction = Date.now();
            return;
        }

        // --- STEP 2: HANDLE QUESTIONS ---
        const options = Array.from(
            document.querySelectorAll(".option_btn, button[data-value]"),
        );
        if (options.length === 0) return; // No questions visible

        // Check if an option is ALREADY selected
        // Flangoo adds 'active', 'selected', or changes background color
        const selectedOption = options.find(
            (opt) =>
                opt.classList.contains("selected") ||
                opt.classList.contains("active") ||
                opt.style.backgroundColor === "rgb(76, 175, 80)",
        );

        if (selectedOption) {
            // --- STEP 3: SUBMIT ---
            // If an answer is selected, we look for the Submit button.
            // We look for the specific .btn-success class or text "Submit Answer"
            const submitBtn = document.querySelectorAll('button[class*="btn-success"]')[1];

            if (submitBtn) {
                // console.log("[FH] Submitting...");
                submitBtn.click();
                // Force event dispatch for React
                submitBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
                submitBtn.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
                state.lastAction = Date.now();
            }
        } else {
            // --- STEP 4: SELECT ANSWER ---
            // If nothing is selected, we find the correct answer and click it.
            const correctIds = Object.values(state.answers);

            for (const opt of options) {
                const val = String(opt.getAttribute("data-value"));
                if (correctIds.includes(val)) {
                    //   console.log(`[FH] Selecting answer: ${val}`);
                    opt.click();
                    opt.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
                    opt.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
                    state.lastAction = Date.now();
                    break; // Stop after clicking one
                }
            }
        }
    }

    // ==========================================
    // 4. INITIALIZATION
    // ==========================================
    function init() {
        // console.log("[FH] Initializing...");
        overrideActivityFunctions();
        simulateActivity();
        requestAnimationFrame(gameLoop);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
