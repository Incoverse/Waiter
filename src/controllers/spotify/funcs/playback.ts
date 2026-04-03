import type SpotifyClient from "../client";

export async function get(this: SpotifyClient): Promise<PlaybackInfo | null> {
  return await this.api.get("/me/player")
    .then((res) => {
      if (res.status === 204) return null; // No content, treat as no active device

      return res.data as PlaybackInfo;
    })
    .catch((e)=>{
      this.logger.warn("Error fetching current playback:", e);
      return null;
    })
}




export type PlaybackInfo = {
  /** The device that is currently active */
  device: {
    /** The device ID. This ID is unique and persistent to some extent. However, this is not guaranteed and any cached device_id should periodically be cleared out and refetched as necessary. */
    id: string | null;
    /** If this device is the currently active device. */
    is_active: boolean;
    /** If this device is currently in a private session. */
    is_private_session: boolean;
    /** Whether controlling this device is restricted. At present if this is "true" then no Web API commands will be accepted by this device. */
    is_restricted: boolean;
    /** A human-readable name for the device. Some devices have a name that the user can configure (e.g. "Loudest speaker") and some devices have a generic name associated with the manufacturer or device model. */
    name: string;
    /** Device type, such as "computer", "smartphone" or "speaker". */
    type: string;
    /** The current volume in percent. */
    volume_percent: number;
    /** If this device can be used to set the volume. */
    supports_volume: boolean;
  };
  /**
   * The current repeat state.
   * 
   * Can be one of:
   * 
   * - "off" - Repeat is off.
   * - "track" - The current track will repeat.
   * - "context" - The current context will repeat.
  */
  repeat_state: "off" | "track" | "context";
  /** If shuffle is on or off. */
  shuffle_state: boolean;
  /** A Context Object. Can be null. */
  context: {
    /** The object type, e.g. "artist", "playlist", "album", "show". */
    type: string;
    /** A link to the Web API endpoint providing full details of the track. */
    href: string;
    /** External URLs for this context. */
    external_urls: {
      /** The Spotify URI for the context. */
      spotify: string;
    };
    /** The Spotify URI for the context. */
    uri: string;
  } | null;
  /** Unix Millisecond Timestamp when playback state was last changed (play, pause, skip, scrub, new song, etc.). */
  timestamp: number;
  /** Progress into the currently playing track or episode. Can be null. */
  progress_ms: number | null;
  /** If something is currently playing, return true. */
  is_playing: boolean;
  /** The currently playing track or episode. */
  item: PlaybackInfoTrackObject | PlaybackInfoEpisodeObject | null;
  /** The object type of the currently playing item. Can be one of track, episode, ad or unknown. */
  currently_playing_type: "track" | "episode" | "ad" | "unknown";
  /** Allows to update the user interface based on which playback actions are available within the current context. */
  actions: {
    disallows: {
      interrupting_playback?: boolean;
      pausing?: boolean;
      resuming?: boolean;
      seeking?: boolean;
      skipping_next?: boolean;
      skipping_prev?: boolean;
      toggling_repeat_context?: boolean;
      toggling_shuffle?: boolean;
      toggling_repeat_track?: boolean;
      transferring_playback?: boolean;
    };
  }
}

type PlaybackInfoTrackObject = {
  /** The album on which the track appears. The album object includes a link in href to full information about the album. */
  album: {
    /** The type of the album */
    album_type: "album" | "single" | "compilation";
    /** The number of tracks in the album. */
    total_tracks: number;
    /** The markets in which the album is available: [ISO 3166-1 alpha-2 country codes](http://en.wikipedia.org/wiki/ISO_3166-1_alpha-2). **NOTE**: an album is considered available in a market when at least 1 of its tracks is available in that market. @deprecated */
    available_markets: string[];
    /** Known external URLs for this album. */
    external_urls: {
      /** The Spotify URL for the album. */
      spotify: string;
    };
    /** A link to the Web API endpoint providing full details of the album. */
    href: string;
    /** The Spotify ID for the album. */
    id: string;
    /** The cover art for the album in various sizes, widest first. */
    images: ImageObject[];
    /** The name of the album. In case of an album takedown, the value may be an empty string. */
    name: string;
    /** The date the album was first released. Depending on the precision of the release date, it might be shown as `YYYY-MM-DD` or `YYYY-MM` or just `YYYY`. */
    release_date: string;
    /** The precision with which `release_date` value is known */
    release_date_precision: "year" | "month" | "day";
    /** Included in the response when a content restriction is applied. */
    restrictions?: {
      /** The reason for the restriction. Albums may be restricted if the content is not available in a given market, to the user's subscription type, or when the user's account is set to not play explicit content. Additional reasons may be added in the future. */
      reason: string;
    };
    /** The object type */
    type: "album";
    /** The Spotify URI for the album. */
    uri: string;
    /** The artists of the album. Each artist object includes a link in href to more detailed information about the artist. */
    artists: SimplifiedArtistObject[];
  };
  /** The artists who performed the track. Each artist object includes a link in href to more detailed information about the artist. */
  artists: SimplifiedArtistObject[];
  /** A list of the countries in which the track can be played, identified by their [ISO 3166-1 alpha-2](http://en.wikipedia.org/wiki/ISO_3166-1_alpha-2) code. @deprecated */
  available_markets: string[];
  /** The disc number (usually `1` unless the album consists of more than one disc). */
  disc_number: number;
  /** The track length in milliseconds. */
  duration_ms: number;
  /** Whether the track has explicit lyrics (true = yes it does; false = no it does not OR unknown). */
  explicit: boolean;
  /** Known external IDs for the track. */
  external_ids: {
    /** The International Standard Recording Code for the track. */
    isrc: string;
    /** The European Article Number for the track. */
    ean: string;
    /** The Universal Product Code for the track. */
    upc: string;
  };
  /** Known external URLs for the track. */
  external_urls: {
    /** The Spotify URL for the track. */
    spotify: string;
  };
  /** A link to the Web API endpoint providing full details of the track. */
  href: string;
  /** The Spotify ID for the track. */
  id: string;
  /** Part of the response when Track Relinking is applied. If true, the track is playable in the given market. Otherwise false. */
  is_playable: boolean;
  /** Part of the response when Track Relinking is applied, and the requested track has been replaced with different track. The track in the linked_from object contains information about the originally requested track. @deprecated */
  linked_from?: { /** This object is just empty on Spotify's documentation :shrug: */  };
  /** Included in the response when a content restriction is applied. */
  restrictions?: {
    /**
     * The reason for the restriction. Additional reasons may be added in the future. **Note**: If you use this field, make sure that your application safely handles unknown values.
     * 
     * Supported reasons are:
     * - "market" - The content item is not available in the given market.
     * - "product" - The content item is not available to the user’s subscription type.
     * - "explicit" - The content item is explicit and the user's account is set to not play explicit content.
    */
    reason: "market" | "product" | "explicit";
  };
  /** The name of the track. In case of a track takedown, the value may be an empty string. */
  name: string;
  /** 
   * The popularity of the track. The value will be between 0 and 100, with 100 being the most popular.
   * The popularity of a track is a value between 0 and 100, with 100 being the most popular. The popularity is calculated by algorithm and is based, in the most part, on the total number of plays the track has had and how recent those plays are.
   * Generally speaking, songs that are being played a lot now will have a higher popularity than songs that were played a lot in the past. Duplicate tracks (e.g. the same track from a single and an album) are rated independently. Artist and album popularity is derived mathematically from track popularity. Note: the popularity value may lag actual popularity by a few days: the value is not updated in real time.
   * @deprecated
  */
  popularity: number;
  /** A link to a 30 second preview (MP3 format) of the track. Can be null @deprecated */
  preview_url: string | null;
  /** The number of the track. If an album has several discs, the track number is the number on the specified disc. */
  track_number: number;
  /** The object type */
  type: "track";
  /** The Spotify URI for the track. */
  uri: string;
  /** Whether the track is a local file or not. */
  is_local: boolean;
}

type PlaybackInfoEpisodeObject = {
  /** A URL to a 30 second preview (MP3 format) of the episode. null if not available. @deprecated */
  audio_preview_url: string | null;
  /** A description of the episode. HTML tags are stripped away from this field, use html_description field in case HTML tags are needed. */
  description: string;
  /** A description of the episode. This field may contain HTML tags. */
  html_description: string;
  /** The episode length in milliseconds. */
  duration_ms: number;
  /** Whether the episode has explicit content (true = yes it does; false = no it does not OR unknown). */
  explicit: boolean;
  /** External URLs for the episode. */
  external_urls: {
    /** The Spotify URL for the episode. */
    spotify: string;
  };
  /** A link to the Web API endpoint providing full details of the episode. */
  href: string;
  /** The Spotify ID for the episode. */
  id: string;
  /** The cover art for the episode in various sizes, widest first. */
  images: ImageObject[];
  /** True if the episode is hosted outside of Spotify's CDN. */
  is_externally_hosted: boolean;
  /** True if the episode is playable in the given market. Otherwise false. */
  is_playable: boolean;
  /** The language used in the episode, identified by a [ISO 639](https://en.wikipedia.org/wiki/ISO_639) code. @deprecated This field is deprecated and might be removed in the future. Please use the languages field instead. */
  language: string;
  /** A list of the languages used in the episode, identified by their [ISO 639-1](https://en.wikipedia.org/wiki/ISO_639) code. */
  languages: string[];
  /** The name of the episode. In case of an episode takedown, the value may be an empty string. */
  name: string;
  /** The date the episode was first released. Depending on the precision of the release date, it might be shown as `YYYY-MM-DD` or `YYYY-MM` or just `YYYY`. */
  release_date: string;
  /** The precision with which `release_date` value is known */
  release_date_precision: "year" | "month" | "day";
  /** The user's most recent position in the episode. Set if the supplied access token is a user token and has the scope 'user-read-playback-position'. */
  resume_point: {
    /** Whether or not the episode has been fully played by the user. */
    fully_played: boolean;
    /** The most recent position in the episode in milliseconds. */
    resume_position_ms: number;
  };
  /** The object type */
  type: "episode";
  /** The Spotify URI for the episode. */
  uri: string;
  /* Included in the response when a content restriction is applied. */
  restrictions?: {
    /**
     * The reason for the restriction. Additional reasons may be added in the future. **Note**: If you use this field, make sure that your application safely handles unknown values.
     * 
     * Supported reasons are:
     * - "market" - The content item is not available in the given market.
     * - "product" - The content item is not available to the user’s subscription type.
     * - "explicit" - The content item is explicit and the user's account is set to not play explicit content.
    */
    reason: "market" | "product" | "explicit";
  };
  /** The show on which the episode belongs. */
  show: {
    /** A list of the countries in which the show can be played, identified by their [ISO 3166-1 alpha-2](http://en.wikipedia.org/wiki/ISO_3166-1_alpha-2) code. @deprecated */
    available_markets: string[];
    /** The copyright statements of the show. */
    copyrights: CopyrightObject[];
    /** A description of the show. HTML tags are stripped away from this field, use html_description field in case HTML tags are needed. */
    description: string;
    /** A description of the show. This field may contain HTML tags. */
    html_description: string;
    /** Whether the show has explicit content (true = yes it does; false = no it does not OR unknown). */
    explicit: boolean;
    /** External URLs for this show. */
    external_urls: {
      /** The Spotify URL for the show. */
      spotify: string;
    };
    /** A link to the Web API endpoint providing full details of the show. */
    href: string;
    /** The Spotify ID for the show. */
    id: string;
    /** The cover art for the show in various sizes, widest first. */
    images: ImageObject[];
    /** True if all of the shows episodes are hosted outside of Spotify's CDN. This field might be null in some cases. */
    is_externally_hosted: boolean | null;
    /** A list of the languages used in the show, identified by their [ISO 639-1](https://en.wikipedia.org/wiki/ISO_639) code. */
    languages: string[];
    /** The media type of the show. */
    media_type: string;
    /** The name of the show. In case of a show takedown, the value may be an empty string. */
    name: string;
    /** The publisher of the show. @deprecated */
    publisher: string;
    /** The object type */
    type: "show";
    /** The Spotify URI for the show. */
    uri: string;
    /** The total number of episodes in the show. */
    total_episodes: number;
  }

}

type SimplifiedArtistObject = {
  /** Known external URLs for this artist. */
  external_urls: {
    /** The Spotify URL for the artist. */
    spotify: string;
  };
  /** A link to the Web API endpoint providing full details about the artist. */
  href: string;
  /** The Spotify ID for the artist. */
  id: string;
  /** The name of the artist. */
  name: string;
  /** The object type */
  type: "artist";
  /** The Spotify URI for the artist. */
  uri: string;
}

type ImageObject = {
  /** The source URL of the image. */
  url: string;
  /** The image height in pixels. */
  height: number;
  /** The image width in pixels. */
  width: number;
}

type CopyrightObject = {
  /** The copyright text for this content. */
  text: string;
  /** The type of copyright: "C" = the copyright, "P" = the sound recording (performance) copyright. */
  type: "C" | "P";
}