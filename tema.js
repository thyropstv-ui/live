/* Tema de cores: aplica o tema guardado antes de a página aparecer (sem piscar). Só paleta. */
(function () {
  var TEMAS = [
    ["neon", "Neon", "#a64dff", "#3b6bff"],
    ["gelo", "Gelo", "#1f8fe0", "#c4f6ff"],
    ["espectro", "Espectro", "#8a3fe8", "#3a3fd8"],
    ["relampago", "Relâmpago", "#5a4cf2", "#5ee1ff"],
    ["luar", "Luar", "#6a5be0", "#ffd25e"]
  ];
  var CHAVE = "thyrops-tema";
  function ler() { try { return localStorage.getItem(CHAVE); } catch (e) { return null; } }
  function gravar(t) { try { localStorage.setItem(CHAVE, t); } catch (e) {} }
  function aplica(t) {
    if (!TEMAS.some(function (x) { return x[0] === t; })) t = "neon";
    document.documentElement.setAttribute("data-tema", t);
  }
  aplica(ler());
  window.Tema = {
    lista: TEMAS,
    atual: function () { return document.documentElement.getAttribute("data-tema"); },
    troca: function (t) {
      aplica(t); gravar(t);
      var cor = getComputedStyle(document.documentElement).getPropertyValue("--abismo").trim();
      var m = document.querySelector('meta[name="theme-color"]');
      if (m && cor) m.setAttribute("content", cor);
    }
  };
})();
