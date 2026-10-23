/* Ski game – configuration. Collée une fois pour toutes après la création du projet Firebase
   (Paramètres du projet > Général > Vos applications > Configuration du SDK). Ces valeurs sont publiques.
   Tant que « firebase » est null, le site tourne en mode local (rien n'est partagé entre joueurs). */
window.SKI_CONFIG = {
  firebase: null,
  /* {
    apiKey: '...', authDomain: '...firebaseapp.com', projectId: '...', storageBucket: '...', messagingSenderId: '...', appId: '...'
  } */
  adminEmail: '', // adresse du compte administrateur (la même que dans les règles Firestore)
};
