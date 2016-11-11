/** @ssr-ready **/

/**
 * External dependencies
 */
import moment from 'moment';
import { memoize, some, startsWith, takeRightWhile, find, findLast } from 'lodash';

/**
 * Internal dependencies
 */
import createSelector from 'lib/create-selector';
import { FIRST_VIEW_CONFIG } from './constants';
import { getActionLog } from 'state/ui/action-log/selectors';
import { getPreference, preferencesLastFetchedTimestamp } from 'state/preferences/selectors';
import { isSectionLoading, getInitialQueryArguments, getSection } from 'state/ui/selectors';
import { FIRST_VIEW_HIDE, ROUTE_SET } from 'state/action-types';
import { getCurrentUserDate } from 'state/current-user/selectors';

const getConfigForPath = memoize( path =>
	find( FIRST_VIEW_CONFIG, entry =>
		some( entry.paths, entryPath =>
			startsWith( path, entryPath ) ) ) || false );

export const getConfigForCurrentView = createSelector(
	state => {
		const currentRoute = findLast( getActionLog( state ), { type: ROUTE_SET } );
		if ( ! currentRoute ) {
			return false;
		}

		const path = currentRoute.path ? currentRoute.path : '';
		return getConfigForPath( path );
	},
	getActionLog
);

export function isUserEligible( state, config ) {
	const userStartDate = getCurrentUserDate( state );

	// If no start date is defined, all users are eligible
	if ( ! config.startDate ) {
		return true;
	}

	// If the user doesn't have a start date, we don't want to show the first view
	if ( ! userStartDate ) {
		return false;
	}

	return moment( userStartDate ).isAfter( config.startDate );
}

export function isQueryStringEnabled( state, config ) {
	const queryArguments = getInitialQueryArguments( state );
	return queryArguments.firstView === config.name;
}

export function isViewEnabled( state, config ) {
	// in order to avoid using an out-of-date preference for whether a
	// FV should be enabled or not, wait until we have fetched the
	// preferences from the API
	if ( ! preferencesLastFetchedTimestamp( state ) ) {
		return false;
	}

	const latestFirstViewHistory = findLast( getPreference( state, 'firstViewHistory' ), { view: config.name } );
	const isViewDisabled = latestFirstViewHistory ? ( !! latestFirstViewHistory.disabled ) : false;

	// If the view is disabled, we want to return false, regardless of state
	if ( isViewDisabled ) {
		return false;
	}

	return isQueryStringEnabled( state, config ) || ( config.enabled && isUserEligible( state, config ) );
}

export function wasFirstViewHiddenSinceEnteringCurrentSection( state, config ) {
	const actionsSinceEnteringCurrentSection = takeRightWhile( getActionLog( state ), ( action ) => {
		return ( action.type !== ROUTE_SET ) || ( action.type === ROUTE_SET && routeSetIsInCurrentSection( state, action ) );
	} );

	return some( actionsSinceEnteringCurrentSection,
		action => action.type === FIRST_VIEW_HIDE && action.view === config.name );
}

function routeSetIsInCurrentSection( state, routeSet ) {
	const section = getSection( state );
	return some( section.paths, path => startsWith( routeSet.path, path ) );
}

// TODO: memoize
export function shouldViewBeVisible( state ) {
	const firstViewConfig = getConfigForCurrentView( state );

	return firstViewConfig &&
		isViewEnabled( state, firstViewConfig ) &&
		! wasFirstViewHiddenSinceEnteringCurrentSection( state, firstViewConfig ) &&
		! isSectionLoading( state );
}

export const hasViewJustBeenVisible = createSelector(
	( state, now = Date.now() ) => {
		console.log( 'called', now - 1478623930204 );
		const lastFirstView = findLast( getActionLog( state ), {
			type: FIRST_VIEW_HIDE
		} );
		// threshold is one minute
		return lastFirstView && ( now - lastFirstView.timestamp ) < 60000;
	},
	( state, now = Date.now() ) => [
		getActionLog( state ),
		Math.floor( now / 10000 )
	],
	// caching only goes stale after 10 s
	( state, now = Date.now() ) => Math.floor( now / 10000 )
);

export function secondsSpentOnCurrentView( state, now = Date.now() ) {
	const currentRoute = findLast( getActionLog( state ), { type: ROUTE_SET } );
	return currentRoute ? ( now - currentRoute.timestamp ) / 1000 : -1;
}

export function bucketedTimeSpentOnCurrentView( state, now = Date.now() ) {
	const timeSpent = secondsSpentOnCurrentView( state, now );

	if ( -1 === timeSpent ) {
		return 'unknown';
	}

	if ( timeSpent < 2 ) {
		return 'under2';
	}

	if ( timeSpent < 5 ) {
		return '2-5';
	}

	if ( timeSpent < 10 ) {
		return '5-10';
	}

	if ( timeSpent < 20 ) {
		return '10-20';
	}

	if ( timeSpent < 60 ) {
		return '20-60';
	}

	return '60plus';
}
