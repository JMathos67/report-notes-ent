# Politique de confidentialité — Report de notes vers l'ENT

**Éditeur** : Thomas Jaeger, enseignant (développeur indépendant, extension gratuite).
**Contact** : jaeger.thom@gmail.com
**Dernière mise à jour** : 6 octobre 2026

## Données traitées
| Donnée | Origine | Où elle est conservée | Durée |
|---|---|---|---|
| Adresse du Moodle et jeton d'accès (« Moodle mobile web service ») | Connexion de l'enseignant à son Moodle | Stockage local de l'extension, sur l'ordinateur de l'enseignant | Jusqu'à « Se déconnecter » ou désinstallation |
| Noms des cours, des activités notées et des groupes/classes | Moodle | Stockage local de l'extension | Jusqu'à « ↻ Actualiser », « Se déconnecter » ou désinstallation |
| Noms des élèves et notes d'une activité | Moodle | Mémoire de session de Chrome (jamais écrite sur le disque) | Effacées après l'envoi de la classe dans MBN, et au plus tard à la fermeture de Chrome |

## Utilisation
Ces données servent uniquement à saisir les notes dans la grille d'évaluation MBN ouverte par l'enseignant.
L'extension communique seulement avec le Moodle de l'enseignant (adresse qu'il a saisie) et la page MBN ouverte dans son navigateur.

## Ce que l'extension ne fait pas
- Aucune transmission à un serveur de l'éditeur ou à un tiers, aucune mesure d'audience, aucune publicité.
- Aucune vente ni aucun partage de données.
- Aucune validation automatique dans MBN : l'enseignant vérifie et valide lui-même.

## Autorisations demandées par Chrome
| Autorisation | Pourquoi |
|---|---|
| `storage` | Mémoriser localement la connexion à Moodle et la liste des cours/activités |
| `activeTab` + `scripting` | Saisir les notes dans l'onglet MBN actif, uniquement quand l'enseignant clique sur « 2. Saisir dans MBN » |
| `webRequest` | Lire une seule fois la redirection de connexion Moodle pour récupérer le jeton d'accès (uniquement pendant la connexion) |
| `debugger` (uniquement dans la version « Vivaldi » diffusée hors Chrome Web Store) | Envoyer de vraies frappes de clavier (chiffres et Entrée) dans le champ « Note » de MBN quand le navigateur ignore les touches simulées. Utilisée uniquement sur l'onglet MBN actif, pendant la saisie |
| Accès à `*.monbureaunumerique.fr` | Saisir les notes dans la grille d'évaluation MBN |
| Accès à l'adresse de son Moodle (demandé à la connexion, une seule adresse) | Lire les cours, groupes et notes via l'API officielle de Moodle |

## Données d'élèves
Les noms et notes d'élèves (données de mineurs) restent dans le navigateur de l'enseignant, entre son Moodle et son ENT, deux services déjà utilisés par l'établissement. L'éditeur n'y a jamais accès. L'enseignant reste responsable de leur usage dans le cadre de ses missions.

## Droits
L'enseignant peut à tout moment effacer toutes les données via « Se déconnecter » ou en désinstallant l'extension, et révoquer le jeton dans Moodle (Préférences → Clés de sécurité → Réinitialiser).

## Modifications
Toute modification de cette politique sera datée ci-dessus. Pour toute question : jaeger.thom@gmail.com.
