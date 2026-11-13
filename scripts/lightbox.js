// Enlarges certificate thumbnails (.ai-certs a) in a native <dialog>.
// Without JS the links still open the full image directly.
(function () {
  var links = document.querySelectorAll(".ai-certs a");
  if (!links.length || typeof HTMLDialogElement === "undefined") return;

  var isEn = (document.documentElement.lang || "").toLowerCase().indexOf("en") === 0;
  var dialog = document.createElement("dialog");
  dialog.className = "lightbox";
  dialog.innerHTML = '<button type="button" class="lightbox-close" aria-label="' + (isEn ? "Close" : "關閉") + '">×</button><img alt="">';
  document.body.appendChild(dialog);
  var img = dialog.querySelector("img");

  links.forEach(function (link) {
    link.addEventListener("click", function (event) {
      event.preventDefault();
      var thumb = link.querySelector("img");
      img.src = link.getAttribute("href");
      img.alt = thumb ? thumb.alt : "";
      dialog.showModal();
    });
  });

  dialog.querySelector(".lightbox-close").addEventListener("click", function () { dialog.close(); });
  // Clicking the backdrop (outside the image) closes it; Esc is handled natively.
  dialog.addEventListener("click", function (event) {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", function () { img.removeAttribute("src"); });
})();
