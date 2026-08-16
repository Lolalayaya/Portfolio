(function () {
  var root = document.documentElement;
  var btn = document.querySelector(".theme-switch");
  if (!btn) return;

  function current() {
    var explicit = root.getAttribute("data-theme");
    if (explicit === "dark" || explicit === "light") return explicit;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function paint() {
    var isDark = current() === "dark";
    btn.textContent = isDark ? "☀︎" : "☾";
    btn.setAttribute("aria-label", isDark ? "切換為亮色模式" : "切換為深色模式");
  }

  btn.addEventListener("click", function () {
    var next = current() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch (error) {}
    paint();
    btn.classList.remove("is-flipping");
    void btn.offsetWidth; // restart the animation if clicked again mid-flip
    btn.classList.add("is-flipping");
    setTimeout(function () { btn.classList.remove("is-flipping"); }, 340);
  });

  paint();
})();
