// ==UserScript==
// @name Flangoo Helper
// @description A userscript that bypasses Flangoo's activity monitoring and provides correct answers
// @match *://*.flangoo.com/reader/*
// @run-at document-start
// @grant none
// ==/UserScript==

(function () {
  "use strict";
  let correctMap = {};
  let isQuizActive = false;
  let mode = "reader"; // 'reader' or 'question'

  // Function to check if quiz is active
  function checkQuizStatus() {
    const quizContainer = document.querySelector(
      ".chapter_questions_container",
    );
    const wasActive = isQuizActive;

    isQuizActive = quizContainer && quizContainer.classList.contains("active");

    if (wasActive !== isQuizActive) {
      console.log(
        `Quiz status changed: \${isQuizActive ? 'ACTIVE' : 'INACTIVE'}`,
      );
      mode = isQuizActive ? "question" : "reader";
      console.log(`Switched to ${mode} mode`);

      if (isQuizActive) {
        // When quiz becomes active, wait a bit then check for questions
        setTimeout(() => {
          console.log("Quiz just became active, checking for questions...");
          checkForQuestions();
        }, 1000);
      }
    }

    return isQuizActive;
  }

  // Override activity monitoring functions (only in reader mode)
  function overrideActivityFunctions() {
    console.log("Setting up activity monitoring overrides...");

    // Override all possible activity-related functions
    window.setActive = () => {
      if (mode === "reader") {
        console.log("setActive called in reader mode, returning true");
        return true;
      }
      return window.originalSetActive?.() || true;
    };

    window.setActive_timer_toggle = () => {
      if (mode === "reader") {
        console.log(
          "setActive_timer_toggle called in reader mode, returning true",
        );
        return true;
      }
      return window.originalSetActive_timer_toggle?.() || true;
    };

    window.setIdleTime = () => {
      if (mode === "reader") {
        console.log("setIdleTime called in reader mode, setting to 0");
        return 0;
      }
      return window.originalSetIdleTime?.() || 0;
    };

    // Store original functions if they exist
    if (window.setActive && !window.originalSetActive) {
      window.originalSetActive = window.setActive;
    }
    if (
      window.setActive_timer_toggle &&
      !window.originalSetActive_timer_toggle
    ) {
      window.originalSetActive_timer_toggle = window.setActive_timer_toggle;
    }
    if (window.setIdleTime && !window.originalSetIdleTime) {
      window.originalSetIdleTime = window.setIdleTime;
    }

    // Override document.hasFocus correctly - it's a function, not a property
    const originalHasFocus = document.hasFocus;
    document.hasFocus = function () {
      if (mode === "reader") {
        console.log("document.hasFocus called in reader mode, returning true");
        return true;
      }
      return originalHasFocus.call(this);
    };

    // Override visibility API to always report visible
    Object.defineProperty(document, "hidden", {
      get: function () {
        if (mode === "reader") {
          console.log("document.hidden called in reader mode, returning false");
          return false;
        }
        return false; // Always return false for consistency
      },
    });

    Object.defineProperty(document, "visibilityState", {
      get: function () {
        if (mode === "reader") {
          console.log(
            "document.visibilityState called in reader mode, returning visible",
          );
          return "visible";
        }
        return "visible"; // Always return visible for consistency
      },
    });

    // Prevent page visibility events
    window.addEventListener(
      "visibilitychange",
      (e) => {
        if (mode === "reader") {
          console.log(
            "visibilitychange event in reader mode, stopping propagation",
          );
          e.stopPropagation();
        }
      },
      true,
    );

    window.addEventListener(
      "blur",
      (e) => {
        if (mode === "reader") {
          console.log("blur event in reader mode, stopping propagation");
          e.stopPropagation();
        }
      },
      true,
    );

    window.addEventListener(
      "focus",
      (e) => {
        if (mode === "reader") {
          console.log("focus event in reader mode, stopping propagation");
          e.stopPropagation();
        }
      },
      true,
    );

    console.log("Activity monitoring overrides set up complete");
  }

  // Function to handle questions and extract correct answers
  function handleQuestions(data) {
    console.log("handleQuestions called with data:", data);

    try {
      // Extract questions from the response
      const questions = data?.data?.bookQuestions || [];
      console.log(`Found ${questions.length} questions in response`);

      questions.forEach((q) => {
        console.log(`Processing question ${q.id}: ${q.question}`);

        // Find the correct option
        const correctOption = q.options?.find((o) => o.accepted === true);

        if (correctOption && q.id) {
          correctMap[q.id] = correctOption.id;
          console.log(
            `Found correct answer for question ${q.id}: ${correctOption.id} (\${correctOption.option_txt})`,
          );
        } else {
          console.log(`Could not find correct answer for question \${q.id}`);
        }
      });

      console.log("Final correctMap:", correctMap);
    } catch (err) {
      console.error("Error handling questions:", err);
    }
  }

  // Intercept fetch requests to get question data
  const origFetch = window.fetch;
  window.fetch = async (...args) => {
    const url = args[0];
    console.log(`Fetch called with URL: ${url}`);

    const resp = await origFetch(...args);

    try {
      const clone = resp.clone();

      // Check if this is the GraphQL API call for questions
      if (typeof url === "string" && url.includes("api.flangoo.com/graphql")) {
        const reqBody = args[1]?.body;
        console.log("GraphQL request detected, body:", reqBody);

        // Check if this is a request for questions
        if (reqBody && reqBody.includes("getQuestions")) {
          console.log("getQuestions request detected, processing response...");
          const data = await clone.json();
          console.log("GraphQL response data:", data);
          handleQuestions(data);
        }
      }
    } catch (err) {
      console.error("Error in fetch interceptor:", err);
    }

    return resp;
  };

  // Function to check for questions on the page
  /***********************
   *  SAFE BUTTON UTILS
   ***********************/
  function findButtonByText(text) {
    return [...document.querySelectorAll("button")].find(
      (btn) =>
        btn.textContent.trim().toLowerCase() === text.toLowerCase() &&
        !btn.disabled &&
        btn.offsetParent !== null,
    );
  }

  function waitForButtonAndClick(text, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();

      const observer = new MutationObserver(() => {
        const btn = findButtonByText(text);
        if (btn) {
          console.log(`Found "${text}" button, clicking`);
          btn.click();
          observer.disconnect();
          resolve(true);
        }

        if (Date.now() - start > timeout) {
          observer.disconnect();
          reject(`Timed out waiting for ${text} button`);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    });
  }

  /*************************
   *  MAIN QUESTION HANDLER
   *************************/
  function checkForQuestions() {
    console.log("checkForQuestions fired");

    if (!isQuizActive) {
      console.log("Quiz inactive, aborting");
      return;
    }

    const allOptionButtons = [
      ...document.querySelectorAll(".option_btn"),
      ...document.querySelectorAll("button[data-value]"),
    ];

    console.log(`Found ${allOptionButtons.length} possible option buttons`);

    if (allOptionButtons.length === 0) return;

    const correctValues = Object.values(correctMap);

    for (const btn of allOptionButtons) {
      const value = btn.getAttribute("data-value");
      if (!value || !correctValues.includes(value)) continue;

      console.log(`Correct answer found: ${value}`);

      setTimeout(
        async () => {
          btn.click();
          console.log("Answer clicked");

          try {
            await waitForButtonAndClick("Submit", 3000);
            await waitForButtonAndClick("Next", 3000);
          } catch (e) {
            console.log(e);
          }
        },
        Math.random() * 800 + 200,
      );

      break;
    }
  }

  /*************************
   *  AUTO-TRIGGER OBSERVER
   *************************/
  const quizDomObserver = new MutationObserver(() => {
    if (mode === "question") {
      checkForQuestions();
    }
  });

  quizDomObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  console.log("Quiz automation loaded");

  // Observer to watch for quiz status changes
  const quizStatusObserver = new MutationObserver(() => {
    checkQuizStatus();
  });

  // Observer to watch for new questions
  const questionObserver = new MutationObserver(() => {
    if (isQuizActive) {
      console.log(
        "DOM changed while quiz is active, checking for questions...",
      );
      checkForQuestions();
    }
  });

  // Simulate mouse movement periodically to prevent idle detection
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

    // Dispatch a random event every 30 seconds only in reader mode
    setInterval(() => {
      if (mode === "reader") {
        const event = events[Math.floor(Math.random() * events.length)];
        console.log("Simulating activity event in reader mode");
        document.dispatchEvent(event);
      }
    }, 30000);
  }

  // Function to handle the MCQ button click
  function handleMCQButtonClick() {
    const observer = new MutationObserver(() => {
      const mcqButton = document.querySelector("#multiple_choice_btn");

      if (mcqButton) {
        console.log("MCQ button found, attaching listener");

        mcqButton.addEventListener("click", () => {
          console.log("MCQ button clicked, waiting for quiz to activate...");
          mode = "question";
          setTimeout(checkQuizStatus, 500);
        });

        observer.disconnect(); // stop watching once found
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  handleMCQButtonClick();

  // Initialize the script
  function init() {
    console.log("Initializing Flangoo Helper...");

    // Override activity monitoring functions
    overrideActivityFunctions();

    // Start observing for quiz status changes
    quizStatusObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });

    // Start observing for questions in the quiz container
    questionObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Start activity simulation
    simulateActivity();

    // Set up MCQ button listener
    setTimeout(handleMCQButtonClick, 5000);

    // Check initial quiz status
    setTimeout(() => {
      console.log("Checking initial quiz status...");
      checkQuizStatus();
    }, 3000);

    console.log("Flangoo Helper initialized");
  }

  // Wait for the page to load before initializing
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
