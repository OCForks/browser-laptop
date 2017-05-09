/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict'

const appConstants = require('../../../js/constants/appConstants')
const filtering = require('../../filtering')
const siteTags = require('../../../js/constants/siteTags')
const siteUtil = require('../../../js/state/siteUtil')
const syncActions = require('../../../js/actions/syncActions')
const syncUtil = require('../../../js/state/syncUtil')
const Immutable = require('immutable')
const settings = require('../../../js/constants/settings')
const {getSetting} = require('../../../js/settings')
const writeActions = require('../../../js/constants/sync/proto').actions

const syncEnabled = () => {
  return getSetting(settings.SYNC_ENABLED) === true
}

const sitesReducer = (state, action, immutableAction) => {
  switch (action.actionType) {
    case appConstants.APP_ON_CLEAR_BROWSING_DATA:
      if (immutableAction.getIn(['clearDataDetail', 'browserHistory'])) {
        state = state.set('sites', siteUtil.clearHistory(state.get('sites')))
        filtering.clearHistory()
      }
      break
    case appConstants.APP_ADD_SITE:
      if (Immutable.List.isList(action.siteDetail)) {
        action.siteDetail.forEach((s) => {
          state = state.set('sites', siteUtil.addSite(state.get('sites'), s, action.tag, undefined, action.skipSync))
        })
      } else {
        let sites = state.get('sites')
        if (!action.siteDetail.get('folderId') && siteUtil.isFolder(action.siteDetail)) {
          action.siteDetail = action.siteDetail.set('folderId', siteUtil.getNextFolderId(sites))
        }
        state = state.set('sites', siteUtil.addSite(sites, action.siteDetail, action.tag, action.originalSiteDetail, action.skipSync))
      }
      if (action.destinationDetail) {
        state = state.set('sites', siteUtil.moveSite(state.get('sites'),
          action.siteDetail, action.destinationDetail, false, false, true))
      }
      state = state.set('sites', state.get('sites').sort(siteUtil.siteSort))
      if (syncEnabled()) {
        state = syncUtil.updateSiteCache(state, action.destinationDetail || action.siteDetail)
      }
      break
    case appConstants.APP_REMOVE_SITE:
      const removeSiteSyncCallback = action.skipSync ? undefined : syncActions.removeSite
      state = state.set('sites', siteUtil.removeSite(state.get('sites'), action.siteDetail, action.tag, true, removeSiteSyncCallback))
      state = state.set('sites', state.get('sites').sort(siteUtil.siteSort))
      if (syncEnabled()) {
        state = syncUtil.updateSiteCache(state, action.siteDetail)
      }
      break
    case appConstants.APP_MOVE_SITE:
      state = state.set('sites', siteUtil.moveSite(state.get('sites'),
        action.sourceDetail, action.destinationDetail, action.prepend,
        action.destinationIsParent, false))
      state = state.set('sites', state.get('sites').sort(siteUtil.siteSort))
      if (syncEnabled()) {
        state = syncUtil.updateSiteCache(state, action.destinationDetail)
      }
      break
    case appConstants.APP_APPLY_SITE_RECORDS:
      let nextFolderId = siteUtil.getNextFolderId(state.get('sites'))
      // Ensure that all folders are assigned folderIds
      action.records.forEach((record, i) => {
        if (record.action !== writeActions.DELETE &&
          record.bookmark && record.bookmark.isFolder &&
          record.bookmark.site &&
          typeof record.bookmark.site.folderId !== 'number') {
          record.bookmark.site.folderId = nextFolderId
          action.records.set(i, record)
          nextFolderId = nextFolderId + 1
        }
      })
      action.records.forEach((record) => {
        const siteData = syncUtil.getSiteDataFromRecord(record, state, action.records)
        const tag = siteData.tag
        let siteDetail = siteData.siteDetail
        const sites = state.get('sites')
        switch (record.action) {
          case writeActions.CREATE:
            state = state.set('sites',
              siteUtil.addSite(sites, siteDetail, tag, undefined, true))
            break
          case writeActions.UPDATE:
            state = state.set('sites',
              siteUtil.addSite(sites, siteDetail, tag, siteData.existingObjectData, true))
            break
          case writeActions.DELETE:
            state = state.set('sites',
              siteUtil.removeSite(sites, siteDetail, tag))
            break
        }
        state = syncUtil.updateSiteCache(state, siteDetail)
      })
      break
    case appConstants.APP_TAB_UPDATED:
      if (immutableAction.getIn(['changeInfo', 'pinned']) != null) {
        const pinned = immutableAction.getIn(['changeInfo', 'pinned'])
        const tabId = immutableAction.getIn(['tabValue', 'tabId'])
        const tab = state.get('tabs').find((tab) => tab.get('tabId') === tabId)
        if (!tab) {
          console.warn('Trying to pin a tabId which does not exist:', tabId, 'tabs: ', state.get('tabs').toJS())
          break
        }
        const sites = state.get('sites')
        const siteDetail = siteUtil.getDetailFromTab(tab, siteTags.PINNED, sites)
        if (pinned) {
          state = state.set('sites', siteUtil.addSite(sites, siteDetail, siteTags.PINNED))
        } else {
          state = state.set('sites', siteUtil.removeSite(sites, siteDetail, siteTags.PINNED))
        }
        if (syncEnabled()) {
          state = syncUtil.updateSiteCache(state, siteDetail)
        }
      }
      break
    case appConstants.APP_CREATE_TAB_REQUESTED: {
      const createProperties = immutableAction.get('createProperties')
      if (createProperties.get('pinned')) {
        state = state.set('sites', siteUtil.addSite(state.get('sites'),
          siteUtil.getDetailFromCreateProperties(createProperties), siteTags.PINNED))
      }
      break
    }
  }
  return state
}

module.exports = sitesReducer
