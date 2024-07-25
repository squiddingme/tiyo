import {
  LanguageKey,
  Series,
  SeriesStatus,
  GetSeriesFunc,
  GetChaptersFunc,
  GetPageRequesterDataFunc,
  GetPageUrlsFunc,
  GetSearchFunc,
  GetImageFunc,
  PageRequesterData,
  GetDirectoryFunc,
  ExtensionClientAbstract,
  GetSettingsFunc,
  SetSettingsFunc,
  GetSettingTypesFunc,
  FilterValues,
  GetFilterOptionsFunc,
  FilterCheckbox,
  FilterSort,
  FilterSeparator,
  FilterMultiToggle,
  MultiToggleValues,
  TriState,
  FilterSortValue,
  SortDirection,
  WebviewResponse,
} from '@tiyo/common';
import { findLanguageKey } from '../../util/parsing';
import {
  FIELDS_COUNTRY,
  FIELDS_DEMOGRAPHICS,
  FIELDS_GENRES,
  FIELDS_SORT,
  FilterControlIds,
} from './filters';
import { JSDOM } from 'jsdom';
import { METADATA } from './metadata';

export * from './metadata';

const API_URL = 'https://api.comick.io';

const SEARCH_LIMIT = 8;

const STATUS_MAP = {
  1: SeriesStatus.ONGOING,
  2: SeriesStatus.COMPLETED,
};

type ComickSearchSeries = {
  title: string;
  id: number;
  slug: string;
  cover_url: string;
};

export class ExtensionClient extends ExtensionClientAbstract {
  override getSeries: GetSeriesFunc = (id: string) => {
    return this.webviewFn(`${API_URL}/comic/${id.split(':')[0]}?tachiyomi=true`).then(
      (response: WebviewResponse) => {
        const json = JSON.parse(
          new JSDOM(response.text).window.document.getElementsByTagName('pre')[0].textContent
        );

        const tags = json.demographic ? [json.demographic] : [];
        json.comic.md_comic_md_genres.forEach((genre) => {
          tags.push(genre.md_genres.name);
        });

        const series: Series = {
          id: undefined,
          extensionId: METADATA.id,
          sourceId: `${json.comic.slug}:${json.comic.id}:${json.comic.hid}`,
          title: json.comic.title,
          altTitles: json.comic.md_titles.map((x: { title: string }) => x.title),
          description: json.comic.desc,
          authors: json.authors.map((author) => author.name),
          artists: json.artists.map((artist) => artist.name),
          tags,
          status: STATUS_MAP[json.comic.status],
          originalLanguageKey: findLanguageKey(json.comic.iso639_1) || LanguageKey.MULTI,
          numberUnread: 0,
          remoteCoverUrl: json.comic.cover_url,
        };
        return series;
      }
    );
  };

  override getChapters: GetChaptersFunc = (id: string) => {
    return this.webviewFn(`${API_URL}/comic/${id.split(':')[2]}/chapters?limit=99999`).then(
      (response: WebviewResponse) => {
        const json = JSON.parse(
          new JSDOM(response.text).window.document.getElementsByTagName('pre')[0].textContent
        );
        return json.chapters.map((chapterObj) => {
          return {
            id: undefined,
            seriesId: undefined,
            sourceId: chapterObj.hid,
            title: '',
            chapterNumber: chapterObj.chap || '',
            volumeNumber: chapterObj.vol || '',
            languageKey: chapterObj.lang
              ? findLanguageKey(chapterObj.lang.substring(0, 2))
              : LanguageKey.MULTI,
            groupName:
              chapterObj.group_name && chapterObj.group_name.length > 0
                ? chapterObj.group_name[0]
                : '',
            time: new Date(chapterObj.updated_at).getTime(),
            read: false,
          };
        });
      }
    );
  };

  override getPageRequesterData: GetPageRequesterDataFunc = (
    seriesSourceId: string,
    chapterSourceId: string
  ) => {
    return this.webviewFn(`${API_URL}/chapter/${chapterSourceId}?tachiyomi=true`).then(
      (response: WebviewResponse) => {
        const json = JSON.parse(
          new JSDOM(response.text).window.document.getElementsByTagName('pre')[0].textContent
        );
        const pageFilenames = json.chapter.images.map((image) => image.url);
        return {
          server: '',
          hash: '',
          numPages: pageFilenames.length,
          pageFilenames,
        };
      }
    );
  };

  override getPageUrls: GetPageUrlsFunc = (pageRequesterData: PageRequesterData) => {
    return pageRequesterData.pageFilenames;
  };

  override getImage: GetImageFunc = (series: Series, url: string) => {
    return new Promise((resolve, reject) => {
      resolve(url);
    });
  };

  override getDirectory: GetDirectoryFunc = (page: number, filterValues: FilterValues) => {
    return this.getSearch('', page, filterValues);
  };

  override getSearch: GetSearchFunc = (text: string, page: number, filterValues: FilterValues) => {
    const params = new URLSearchParams({
      tachiyomi: 'true',
      limit: `${SEARCH_LIMIT}`,
      page: `${page}`,
    });

    if (text) params.append('q', text);

    if (FilterControlIds.Genres in filterValues) {
      Object.entries(filterValues[FilterControlIds.Genres] as MultiToggleValues).forEach(
        ([genre, value]) => {
          if (value === TriState.INCLUDE) params.append('genres', genre);
          if (value === TriState.EXCLUDE) params.append('excludes', genre);
        }
      );
    }
    if (FilterControlIds.Demographic in filterValues) {
      Object.entries(filterValues[FilterControlIds.Demographic] as MultiToggleValues).forEach(
        ([demo, value]) => {
          if (value === TriState.INCLUDE) params.append('demographic', demo);
        }
      );
    }
    if (FilterControlIds.Country in filterValues) {
      Object.entries(filterValues[FilterControlIds.Country] as MultiToggleValues).forEach(
        ([country, value]) => {
          if (value === TriState.INCLUDE) params.append('country', country);
        }
      );
    }
    if (FilterControlIds.Sort in filterValues) {
      const sort = filterValues[FilterControlIds.Sort] as FilterSortValue;
      params.append('sort', sort.key);
    }
    if (FilterControlIds.Completed in filterValues) {
      if (filterValues[FilterControlIds.Completed] === true) {
        params.append('completed', '1');
      }
    }

    return this.webviewFn(`${API_URL}/v1.0/search?` + params).then((response: WebviewResponse) => {
      const json = JSON.parse(
        new JSDOM(response.text).window.document.getElementsByTagName('pre')[0].textContent
      );
      const seriesList: Series[] = json.map((seriesObj: ComickSearchSeries) => {
        const series: Series = {
          id: undefined,
          extensionId: METADATA.id,
          sourceId: `${seriesObj.slug}:-1`,
          title: seriesObj.title,
          altTitles: [],
          description: '',
          authors: [],
          artists: [],
          tags: [],
          status: SeriesStatus.ONGOING,
          originalLanguageKey: LanguageKey.MULTI,
          numberUnread: 0,
          remoteCoverUrl: seriesObj.cover_url,
        };
        return series;
      });

      return {
        seriesList,
        hasMore: seriesList.length === SEARCH_LIMIT,
      };
    });
  };

  override getSettingTypes: GetSettingTypesFunc = () => {
    return {};
  };

  override getSettings: GetSettingsFunc = () => {
    return {};
  };

  override setSettings: SetSettingsFunc = () => {};

  override getFilterOptions: GetFilterOptionsFunc = () => {
    return [
      new FilterSort(FilterControlIds.Sort, 'Sort', {
        key: 'follow',
        direction: SortDirection.DESCENDING,
      })
        .withFields(FIELDS_SORT)
        .withSupportsBothDirections(false),

      new FilterSeparator('separator1', '', ''),

      new FilterMultiToggle(FilterControlIds.Genres, 'Genres', {})
        .withFields(FIELDS_GENRES)
        .withIsTriState(true),
      new FilterMultiToggle(FilterControlIds.Demographic, 'Demographics', {})
        .withFields(FIELDS_DEMOGRAPHICS)
        .withIsTriState(false),
      new FilterMultiToggle(FilterControlIds.Country, 'Types', {})
        .withFields(FIELDS_COUNTRY)
        .withIsTriState(false),

      new FilterSeparator('separator2', '', ''),

      new FilterCheckbox(FilterControlIds.Completed, 'Completed series only', false),
    ];
  };
}
