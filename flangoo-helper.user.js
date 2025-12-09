// ==UserScript==
// @name         Flangoo Helper
// @description  A userscript that pushes you towards the correct answer in Flangoo
// @match        *://*.flangoo.com/*
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';
    let correctMap = {};

    function handleQuestions(json) {
        const qList = json?.data?.bookQuestions || [];
        qList.forEach(q => {
            const correct = q.options.find(o => o.accepted);
            if (correct) {
                correctMap[q.id] = correct.id;
            }
        });
    }

    const origFetch = window.fetch;
    window.fetch = async (...args) => {
        const resp = await origFetch(...args);
        try {
            const clone = resp.clone();
            const url = args[0];
            if (url.includes("api.flangoo.com/graphql")) {
                const reqBody = args[1]?.body;
                if (reqBody && reqBody.includes("getQuestions")) {
                    const data = await clone.json();
                    handleQuestions(data);
                }
            }
        } catch (err) {}
        return resp;
    };

    const observer = new MutationObserver(() => {
        document.querySelectorAll("button[data-value]").forEach(btn => {
            if (Object.values(correctMap).includes(btn.getAttribute("data-value"))) {
                btn.click();
            }
        });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
})();
