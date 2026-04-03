"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
    const [dark, setDark] = useState(true);

    useEffect(() => {
        // Sync React state with the server-rendered class
        setDark(document.documentElement.classList.contains("dark"));
    }, []);

    function toggle() {
        const next = !dark;
        setDark(next);
        document.documentElement.classList.toggle("dark", next);
        // Set cookie so the server renders the correct theme on next request
        document.cookie = `theme=${next ? "dark" : "light"};path=/;max-age=31536000;SameSite=Lax`;
    }

    return (
        <button
            onClick={toggle}
            className="ml-auto rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
        >
            {dark ? "☀️ Light" : "🌙 Dark"}
        </button>
    );
}
