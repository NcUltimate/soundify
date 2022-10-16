SC = {
  RECORD_LABELS: [
    'LYD',
    'Insomniac Records',
    'Simplify.',
    'Selected.',
    'Gemstone Records',
    'Dharma Worldwide',
    'Future House Cloud',
    'Pantheon Select',
    'Lowly.',
    'Protocol Recordings',
    'bitbird',
    'S I Z E',
    'NCS',
    'MA Music',
    'Proximity',
    'SKINK',
    'AFTR:HRS',
    'Strange Fruits',
    'Big Beat Records',
    'Musical Freedom',
    'MrSuicideSheep',
    'Revealed Recordings',
    'Bass House Music',
    'Future House Music',
    'Armada Music',
    'Enhanced',
    'HEXAGON',
    'Anjunadeep',
    "Spinnin' Records",
    'Monstercat',
    '2-Dutch',
  ],
  SPECIAL_CHAR_MAP: {
    'ã': 'a', // e.g. pontos de exclamação
    'ä': 'a', // e.g. john dahlbäck
    'â': 'a', // e.g. françois-rené duchâble
    'æ': 'ae', // e.g. mædi
    'ç': 'c', // e.g. pontos de exclamação
    'ë': 'e', // e.g. Tiësto
    'é': 'e', // e.g. emelie cyréus, isabèl usher
    'ē': 'e', // e.g. anamē
    'í': 'i', // e.g. sofía reyes, oisín
    'ø': 'o', // e.g. Mø, xylø, møme
    'ö': 'o', // e.g. öwnboss, möwe
    'ó': 'o', // e.g. jenő jandó
    'ő': 'o', // e.g. jenő jandó
    'ü': 'u', // e.g. gattüso
  },
  ARTIST_EXCEPTIONS: {
    'k.flay' : 'kflay',
  },
  async init() {
    this.RECORD_LABELS = this.RECORD_LABELS.map(label => this._sanitize(label));

    await this._loadJQuery().then((loadedJQuery) => this.$ = loadedJQuery);
    return this;
  },
  async search(term) {
    let $searchResultItems = await this._search_for(term);
    return $searchResultItems.map((_i, result) => {
      const $result = this.$(result);

      let title = $result.find('.soundTitle__title');
      title = title.length === 0 ? '' : title.text();

      let user = $result.find('.soundTitle__usernameText');
      user = user.length === 0 ? '' : user.text();

      let plays = $result.find('.sound__soundStats .sc-ministats-item');
      plays = plays.length === 0 ? 0 : plays.attr('title').replaceAll(/\D/g, '');

      return {
        title: this._sanitize(title),
        user: this._sanitize(user),
        plays: parseInt(plays),
        html: $result,
      };
    });
  },
  async identify(trackName, artistNames, {remixArtist} = {}) {
    const nTrackName = this._sanitize(trackName);
    const nArtistNames = artistNames.map(a => this._sanitize(a));
    const nRemixArtist = this._sanitize(remixArtist);
    const isRemixAllowed = !!remixArtist;
    const remixRegexp = new RegExp(`${nRemixArtist}.+?(remix|mix|edit|bootleg|vip mix)`);

    let searchNames = nArtistNames;
    if(remixArtist && !searchNames.includes(remixArtist)) {
      searchNames.push(remixArtist);
    }

    let searchResults = await this.search(`${searchNames.join(' ')} ${trackName}`);

    // 1. Test for exact matches:
    //    - User is the artist, track title is the song title, contains a remix name if present
    exactMatches = searchResults.filter((_idx, result) => {
      if(!result.title.includes(nTrackName)) {
        return false;
      }

      let isExactArtist = (
        nArtistNames.includes(result.user)
          || nArtistNames.find(nArtistName => result.user === this.ARTIST_EXCEPTIONS[nArtistName])
          || isRemixAllowed && result.user === nRemixArtist
      );

      if(!isExactArtist) {
        return false;
      }

      if(!isRemixAllowed && result.title.includes('remix')) {
        return false;
      } else if(isRemixAllowed && !remixRegexp.test(result.title)) {
        return false;
      }

      return true;
    });

    if(exactMatches.length > 0) {
      return Object.assign({}, exactMatches[0], { type: 'exact' });
    }

    // 2. Test for record label uploads
    //    - Artist and track name are the title, and the track was released by the label
    const nArtistRegex = new RegExp(nArtistNames.join('|'));
    recordLabelMatches = searchResults.filter((_idx, result) => {
      let baseCriteria =(
        result.title.includes(nTrackName)
          && nArtistRegex.test(result.title)
          && this.RECORD_LABELS.includes(result.user)
      );

      if(!baseCriteria) {
        return false;
      }

      if(!isRemixAllowed && result.title.includes('remix')) {
        return false;
      } else if(isRemixAllowed && !remixRegexp.test(result.title)) {
        return false;
      }

      return true;
    });

    if(recordLabelMatches.length > 0) {
      return Object.assign({}, recordLabelMatches[0], { type: 'label' });
    }

    // 3. Heuristically determine next most likely track
    //    - Filter out remixes, unless requested
    //    - Filter out low play count
    //    - Sort by play count, pick the first
    closestResults = searchResults.filter((_idx, result) => {
      // Does the title at least include all parts of the searched track name
      let allTrackNamePartsIncluded = true;
      nTrackName.split(/\s+/).forEach(trackNamePart => {
        allTrackNamePartsIncluded &&= result.title.includes(trackNamePart);
      });

      if(!allTrackNamePartsIncluded) {
        return false;
      }

      // At this point none of the tracks are by the artist or remix artist, so
      // are either of their names at least in the track title
      if(!nArtistRegex.test(result.title) || (isRemixAllowed && !result.title.includes(nRemixArtist))) {
        return false;
      }

      // Filter unallowed remixes
      if(!isRemixAllowed && result.title.includes('remix')) {
        return false;
      }

      // Remove low play count - likely not the big track we're looking for
      if(result.plays < 5000) {
        return false;
      }
      
      return true;
    });

    if(closestResults.length === 0) {
      return { title: '', user: '', type: 'no_match' };
    }

    let closestResult = closestResults.sort((r1, r2) => r2.plays - r1.plays)[0];
    return Object.assign({}, closestResult, { type: 'closest' });
  },
  async addToPlaylist(result) {
    // Refuse to add empty results to a playlist.
    if(result.type === 'no_match') {
      return false;
    }

    // Pick "Transfer" playlist closest to the top with lowest track count (less than 500)
    const $playlistOverlay = await this._open_playlist_modal(result.html);

    // console.log({$playlistOverlay});

    // Make sure we're selecting a transfer playlist
    const $transferPlaylists = $playlistOverlay.find('.addToPlaylistList__item').filter((_i, playlist) => {
      const $title = this.$(playlist).find('a.addToPlaylistItem__titleLink');
      const actualTitle = $title.attr('title');
      // console.log({$title, actualTitle});
      return actualTitle.includes('Transfer') && !actualTitle.includes('Closest');
    });


    // console.log({$transferPlaylists});

    // Make sure this track is not already in a transfer paylist
    const $alreadyInPlaylists = $transferPlaylists.filter((_i, playlist) => {
      const $addToPlaylistButton = this.$(playlist).find('button.addToPlaylistButton');
      // console.log({title: $addToPlaylistButton.attr('title'), $addToPlaylistButton});
      return $addToPlaylistButton.attr('title') === 'Remove';
    });

    // console.log({$alreadyInPlaylists});

    if($alreadyInPlaylists.length > 0) {
      $playlistOverlay.find('button.modal__closeButton').click();
      return false;
    }

    // If this is not an "exact" or "label" match, add to our Approximate ("Closest") Transfers list
    if(result.type === 'closest') {
      const $transferListClosest = $transferPlaylists.filter((_i, playlist) => {
        const $title = this.$(playlist).find('a.addToPlaylistItem__titleLink');
        return $title.attr('title').includes('Closest');
      });

      let trackAdded = false;
      if($transferListClosest.length > 0) {
        $transferListClosest.eq(0).find('button.addToPlaylistButton').click();
        trackAdded = true;
      }

      $playlistOverlay.find('button.modal__closeButton').click();
      if(!trackAdded) {
        alert('Please create a new playlist with "Transfer" and "Closest" in the name to continue.');
      }
      return trackAdded;
    }
    
    // Find a transfer playlist with under 500 tracks
    const $playlistsUnder500 = $transferPlaylists.filter((_i, playlist) => {
      const trackCount = parseInt(this.$(playlist).find('.addToPlaylistItem__count').text().trim());
      // console.log({trackCount});
      return trackCount < 500;
    });

    // console.log({$playlistsUnder500});

    // At least one playlist can accommodate this track. Add it and close the modal
    if($playlistsUnder500.length > 0) {
      const $playlist = $playlistsUnder500.eq(0);
      $playlist.find('button.addToPlaylistButton').click();
      $playlistOverlay.find('button.modal__closeButton').click();
      return true;
    }

    // Otherwise, we need to make a new transfer paylist.
    $playlistOverlay.find('button.modal__closeButton').click();
    alert('Please create a new playlist with "Transfer" in the name to continue.');
    return false;
  },
  _sanitize(name) {
    if(!name) {
      return '';
    }

    let newName = name.toLowerCase().trim();
    Object.entries(this.SPECIAL_CHAR_MAP).forEach((entry) => {
      newName = newName.replaceAll(entry[0], entry[1]);
    });
    return newName;
  },
  _get_results_digest() {
    searchID = this.$('.searchItem .sc-link-primary');
    if(searchID.length === 0) {
      searchID = ''; 
    } else {
      searchID = searchID.text().trim().replaceAll(/\W/g, '');
    }
    return searchID;
  },
  _search_for(term) {
    return new Promise((resolve) => {
      if(this._is_current_search_id(term)) {
        // console.log('SAME SEARCH');
        return resolve(this.currentSearchResults);
      }

      // perform search
      this.$('input.headerSearch__input').val(`${term}`);
      this.$('button.headerSearch__submit').click();

      let maxTries = 16;
      const currentSearchDigest = this._get_results_digest();
      const searchIntervalID = setInterval(() => {
        maxTries--;

        if(maxTries === 0) {
          this.currentSearchResults = this.$();
          this.currentSearchID = this._to_search_id(term);
          clearInterval(searchIntervalID);
          return resolve(this.currentSearchResults);
        }
        
        const newSearchDigest = this._get_results_digest();
        if(newSearchDigest === '') {
          return;
        }

        // console.log('DIGESTING');
        // console.log({ID: this.currentSearchID, newSearchDigest, currentSearchDigest});

        if(!this.currentSearchID || newSearchDigest !== currentSearchDigest) {
          // console.log('DIGESTED');
          this.currentSearchResults = this.$('.searchItem__trackItem.track');
          this.currentSearchID = this._to_search_id(term);
          clearInterval(searchIntervalID);
          return resolve(this.currentSearchResults);
        }
      }, 250);
    });
  },
  _open_playlist_modal($result) {
    return new Promise((resolve) => {
      // Click 'More' then 'Add to playlist'
      $result.find('.sc-button-more').click();
      this.$('body .dropdownMenu[id*="dropdown-button"] .sc-button-addtoset').click();

      const waitIntervalID = setInterval(() => {
        const $playlistModal = this.$('[id*=overlay].modal .modal__modal');
        if($playlistModal.length > 0) {
          const $playlistItemTitles = $playlistModal.find('.addToPlaylistList__item a.addToPlaylistItem__titleLink');
          if($playlistItemTitles.length > 0) {
            clearInterval(waitIntervalID);
            setTimeout(() => {
              return resolve($playlistModal);
            }, 1000);
          }
        }
      }, 100);
    });
  },
  _to_search_id(term) {
    return term.replaceAll(/\W/g, '');
  },
  _is_current_search_id(term) {
    return this.currentSearchID === this._to_search_id(term);
  },
  _loadJQuery() {
    return new Promise((resolve) => {
      var jq = document.createElement('script');
      jq.src = "https://code.jquery.com/jquery-3.6.1.min.js";
      document.getElementsByTagName('head')[0].appendChild(jq);

      var loadJQueryIntervalID = setInterval(() => {
        jqueryLoaded = true;
        try { 
          jQuery.noConflict();
        } catch {
          jqueryLoaded = false;
        }

        if(jqueryLoaded) { 
          clearInterval(loadJQueryIntervalID);
          return resolve(jQuery)
        };
      }, 50);
    });
  },
};
