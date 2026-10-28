export const fr = {
  app: {
    title: 'Event Looper',
    tagline: 'Visualisez la boucle d’événements JavaScript.',
    examples: 'Exemples',
    language: 'Langue',
    theme: 'Thème',
    share: 'Partager',
    shared: 'Lien copié !',
  },
  panels: {
    code: 'Code',
    callStack: 'Pile d’appels',
    webApis: 'Web APIs',
    taskQueue: 'File des macrotâches',
    microtaskQueue: 'File des microtâches',
    eventLoop: 'Event loop',
    console: 'Console',
    explanation: 'Que se passe-t-il ?',
  },
  hints: {
    callStack: 'Le code en cours d’exécution. Une seule chose à la fois.',
    webApis: 'Le navigateur gère les minuteurs et le réseau en parallèle.',
    taskQueue: 'setTimeout, setInterval, événements… Une tâche par tour de boucle.',
    microtaskQueue: 'Promesses, await, queueMicrotask. Vidée entièrement après chaque tâche.',
  },
  controls: {
    run: 'Exécuter',
    edit: 'Modifier le code',
    play: 'Lecture',
    pause: 'Pause',
    next: 'Étape suivante',
    prev: 'Étape précédente',
    first: 'Début',
    last: 'Fin',
    speed: 'Vitesse',
    step: 'Étape {{current}} / {{total}}',
    shortcuts: 'Raccourcis : ← → pour avancer, espace pour lecture/pause',
    click: 'Cliquer',
    clickTitle:
      'Simule un clic de l’utilisateur sur le bouton de la page, maintenant. Le gestionnaire part dans la file des macrotâches.',
  },
  empty: {
    stack: 'Pile vide',
    queue: 'File vide',
    webApis: 'Rien en attente',
    console: 'Aucune sortie',
    idle: 'Écrivez du code ou choisissez un exemple, puis cliquez sur « Exécuter ».',
  },
  frame: {
    script: 'script principal',
    anonymous: '(anonyme)',
  },
  source: {
    setTimeout: 'setTimeout',
    setInterval: 'setInterval',
    fetch: 'fetch',
    then: 'then',
    await: 'reprise après await',
    thenable: 'adoption de promesse',
    passThrough: 'transmission',
    queueMicrotask: 'queueMicrotask',
    click: 'clic',
    requestAnimationFrame: 'requestAnimationFrame',
  },
  phase: {
    script: 'Script',
    microtasks: 'Microtâches',
    task: 'Macrotâche',
    render: 'Rendu',
    timers: 'Attente',
    done: 'Terminé',
  },
  phaseHelp: {
    render:
      'Rendu : au plus une fois par frame d’écran (~16 ms à 60 Hz), jamais au milieu d’une tâche ni des microtâches. Le navigateur le saute si rien n’a changé, si l’onglet est caché ou s’il ralentit volontairement. Ordre : resize/scroll, requestAnimationFrame, styles et layout, peinture. Cliquer pour ouvrir la spec HTML.',
  },
  webapi: {
    remaining: 'reste {{ms}} ms',
    delay: '{{ms}} ms',
    listening: 'en écoute',
    nextFrame: 'prochaine image dans {{ms}} ms',
  },
  themes: {
    arcade: 'Rétro arcade',
    metro: 'Plan de métro',
    blueprint: 'Blueprint',
    brutalist: 'Néo-brutaliste',
    rpg: 'RPG',
  },
  quiz: {
    toggle: 'Mode quiz',
    toggleHint: 'Devinez l’ordre des logs avant de voir l’exécution',
    title: 'Quiz : dans quel ordre s’affichent les logs ?',
    instructions: 'Cliquez sur les lignes dans l’ordre où vous pensez qu’elles apparaîtront dans la console.',
    yourOrder: 'Votre ordre',
    pool: 'Lignes à placer',
    undo: 'Annuler',
    check: 'Vérifier',
    skip: 'Passer et voir l’exécution',
    watch: 'Voir l’exécution pas à pas',
    perfect: 'Parfait, tout est dans le bon ordre ! 🎉',
    score: '{{score}} sur {{total}} au bon endroit.',
    solution: 'Ordre réel :',
    noOutput: 'Ce programme n’affiche rien dans la console : pas de quiz cette fois.',
  },
  clock: 't = {{ms}} ms',
  explain: {
    start: 'Le script démarre : le code global est placé sur la <b>pile d’appels</b> et s’exécute ligne par ligne.',
    scriptEnd: 'Le script global est terminé, la pile est vide. L’<b>event loop</b> prend le relais.',
    call: 'Le code appelle <c>{{name}}</c> : c’est seulement maintenant qu’elle entre dans la <b>pile d’appels</b> et que son code s’exécute. Le code appelant attend qu’elle se termine.',
    return:
      '<c>{{name}}</c> se termine et renvoie <c>{{value}}</c> : elle est retirée de la pile d’appels et le code appelant reprend.',
    callAsync:
      'Appel de la fonction async <c>{{name}}</c> : elle s’exécute de façon synchrone jusqu’à son premier <c>await</c>.',
    awaitValue: '<c>await</c> dans <c>{{name}}</c> : on attend la promesse <c>{{value}}</c>.',
    awaitSuspend:
      '<c>{{name}}</c> est suspendue et quitte la pile. La suite reprendra en microtâche quand la promesse sera réglée. Le code appelant continue.',
    asyncResume: '<c>{{name}}</c> reprend après son <c>await</c>, avec la valeur <c>{{value}}</c>.',
    asyncResumeThrow:
      '<c>{{name}}</c> reprend après son <c>await</c>, mais la promesse a été rejetée : l’erreur est levée à cet endroit.',
    asyncDone: '<c>{{name}}</c> se termine : la promesse qu’elle avait renvoyée est résolue avec <c>{{value}}</c>.',
    asyncThrow: '<c>{{name}}</c> lève une erreur (<c>{{text}}</c>) : sa promesse est rejetée.',
    log: '<c>console.log</c> affiche « {{text}} » dans la console.',
    'webapi.setTimeout':
      '<c>setTimeout</c> confie <c>{{name}}</c> au navigateur avec un délai de {{delay}} ms. Le code continue <b>sans attendre</b>.',
    'webapi.setInterval':
      '<c>setInterval</c> confie <c>{{name}}</c> au navigateur : il sera mis en file toutes les {{delay}} ms.',
    'webapi.fetch':
      '<c>fetch</c> lance la requête <c>{{url}}</c> en arrière-plan (environ {{delay}} ms). Elle renvoie immédiatement une promesse en attente.',
    'webapi.requestAnimationFrame':
      '<c>requestAnimationFrame</c> demande au navigateur d’appeler <c>{{name}}</c> juste avant de dessiner la prochaine image.',
    'event.listen':
      '<c>addEventListener</c> enregistre <c>{{name}}</c> : le navigateur écoute désormais les clics sur le bouton.',
    'event.unlisten': '<c>{{name}}</c> n’écoute plus les clics.',
    'event.click':
      'Clic ! Le navigateur ajoute le gestionnaire à la <b>file des macrotâches</b>. Il ne s’exécutera que lorsque la pile sera vide.',
    'event.clickIgnored': 'Clic ! Mais aucun gestionnaire n’écoute le bouton : il ne se passe rien.',
    'loop.render':
      'Le navigateur peut dessiner une nouvelle image (t = {{time}} ms) : il exécute d’abord les callbacks de <c>requestAnimationFrame</c>.',
    'loop.runAnimationFrame': 'Phase de rendu : exécution de <c>{{name}}</c> avant de dessiner l’image.',
    'webapi.clear': 'Le minuteur n°{{id}} est annulé et retiré des Web APIs.',
    timerDone:
      'Le minuteur de <c>{{name}}</c> est écoulé : le callback rejoint la <b>file des macrotâches</b>. Il ne s’exécute pas tout de suite, il attend son tour.',
    fetchDone: 'La réponse de <c>{{url}}</c> est arrivée : une tâche est ajoutée pour régler la promesse.',
    fetchResolved:
      'La promesse de <c>fetch</c> est résolue avec la réponse : les callbacks en attente passent en microtâches.',
    'enqueue.then': 'La promesse est réglée : le callback <c>{{name}}</c> passe dans la <b>file des microtâches</b>.',
    'enqueue.await':
      'La promesse attendue par <c>{{name}}</c> est réglée : sa reprise est ajoutée à la <b>file des microtâches</b>.',
    'enqueue.thenable':
      'On résout une promesse avec une autre promesse : il faut d’abord l’« adopter », ce qui coûte une microtâche supplémentaire.',
    'enqueue.passThrough':
      'Ce <c>then</c> n’a pas de callback pour ce cas : une microtâche transmet simplement le résultat à la promesse suivante.',
    'enqueue.queueMicrotask':
      '<c>queueMicrotask</c> ajoute <c>{{name}}</c> directement à la <b>file des microtâches</b>.',
    'loop.runMicrotask':
      'La pile est vide : l’event loop exécute la prochaine <b>microtâche</b> (<c>{{name}}</c>). Toutes les microtâches passent avant la prochaine tâche.',
    'loop.runTask':
      'Plus aucune microtâche : l’event loop prend <b>une seule tâche</b> dans la file (<c>{{name}}</c>).',
    'loop.waitTimers': 'Rien à exécuter : l’event loop attend. Le temps avance jusqu’à t = {{time}} ms.',
    'loop.done': 'Plus rien dans la pile, les files ni les Web APIs : le programme est terminé.',
    uncaught: 'Erreur non interceptée : <c>{{text}}</c>. La pile est vidée, mais l’event loop continue.',
    unhandledRejection: 'Une promesse a été rejetée sans <c>catch</c> : <c>{{text}}</c>.',
  },
  error: {
    title: 'Impossible d’exécuter ce code',
    syntax: 'Erreur de syntaxe : {{message}}',
    unsupported: 'Cette syntaxe n’est pas encore prise en charge par le visualiseur : {{type}}.',
    tooManySteps: 'Le programme dépasse {{max}} étapes : la visualisation est tronquée.',
    stackOverflow: 'Taille maximale de la pile d’appels dépassée : la récursion est trop profonde (ou infinie).',
    tooManyOps: 'Le programme semble tourner en boucle infinie : exécution arrêtée.',
    awaitOutsideAsync: '« await » n’est autorisé que dans une fonction async.',
  },
};

export type Resources = typeof fr;
