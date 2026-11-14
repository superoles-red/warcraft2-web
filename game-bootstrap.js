'use strict';

// The original compositor selects its drawing ABI from these parameters.
const gameURL = new URL(location.href);
const movieMute = gameURL.searchParams.has('movie-mute');
gameURL.search = 'warcraft2&bridge=v16&view=map&camera=independent';
if (movieMute) gameURL.searchParams.set('movie-mute', '');
history.replaceState(history.state, '', gameURL);
if (!navigator.serviceWorker?.controller || !crossOriginIsolated) {
  location.replace('./');
}
