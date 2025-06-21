function applyThemeSelectorLogic() {
    const themeSelect = document.getElementById("theme-select");
    const savedTheme = localStorage.getItem("theme") || "light";
    document.documentElement.setAttribute("data-theme", savedTheme);

    if (themeSelect) {
        themeSelect.value = savedTheme;

        themeSelect.addEventListener("change", function () {
            const selectedTheme = this.value;
            document.documentElement.setAttribute("data-theme", selectedTheme);
            localStorage.setItem("theme", selectedTheme);
        });
    }
}