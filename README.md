# Event Looper

Visualiseur pédagogique de l’event loop JavaScript, en français par défaut, avec bascule en anglais.
Inspiré de [Loupe](https://latentflip.com/loupe/) et [JS Visualizer 9000](https://www.jsv9000.app).

_A teaching tool that visualizes the JavaScript event loop, step by step (French by default, English available)._

## Fonctionnalités

- Pile d’appels, Web APIs, file des tâches, file des microtâches et indicateur de phase de l’event loop.
- Lecture pas à pas, retour arrière, timeline, vitesse réglable, raccourcis clavier (← → espace).
- Une explication en français ou en anglais pour chaque étape.
- Bouton « Cliquer sur le bouton » pour simuler un clic utilisateur pendant l’exécution.
- Mode quiz : devinez l’ordre des logs avant de voir l’exécution.
- Exemples intégrés, et code partageable par URL.

## Démarrer

```sh
npm install
npm run dev     # serveur de développement
npm test        # tests du moteur
npm run build   # build statique dans dist/
```

## Comment ça marche

Le code n’est jamais exécuté par le navigateur. `src/engine/interpreter.ts` est un petit interpréteur
JavaScript écrit avec des générateurs (ce qui permet à `await` de suspendre une fonction). Il simule la
boucle d’événements avec une horloge virtuelle et enregistre une photo de l’état à chaque étape. L’interface
ne fait que rejouer ces photos.

Pour chaque exemple, les tests vérifient que l’ordre des `console.log` est identique à une vraie exécution Node.

## JavaScript pris en charge

- Variables (`var`, `let`, `const`), fonctions, fonctions fléchées, closures, `this`, `new` sur une fonction.
- `if`, `for`, `for…of`, `for…in`, `while`, `do…while`, `switch`, `try/catch/finally`, `throw`.
- Objets, tableaux, déstructuration, spread/rest, template literals, `?.`, `??`.
- `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`, `queueMicrotask`, `requestAnimationFrame`.
- `Promise` (`then`, `catch`, `finally`, `resolve`, `reject`, `all`, `allSettled`, `race`), `async`/`await`.
- `fetch` simulé (réponse après 500 ms), `button.addEventListener('click', …)`.
- `console.log/info/warn/error`, `Math`, `JSON`, `Object.keys/values/entries/assign`, méthodes de tableaux et de chaînes.

Pas encore pris en charge : `class`, getters/setters, générateurs, expressions régulières, labels, modules.

## Ajouter une langue ou un exemple

- Langues : `src/i18n/` (le type de `fr.ts` garantit que chaque traduction est complète).
- Exemples : `src/examples.ts`.
