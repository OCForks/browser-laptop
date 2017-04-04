/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// Controller view which manages the top level immutable state for the app

const React = require('react')
const Immutable = require('immutable')
const windowStore = require('../stores/windowStore')
const appStoreRenderer = require('../stores/appStoreRenderer')
const windowActions = require('../actions/windowActions')
const appActions = require('../actions/appActions')
const Main = require('./main')
const SiteTags = require('../constants/siteTags')
const cx = require('../lib/classSet')
const {getPlatformStyles} = require('../../app/common/lib/platformUtil')
const {getDetailFromFrame, getDetailFromTab, getSiteKey, siteSort} = require('../state/siteUtil')
const {currentWindowId} = require('../../app/renderer/currentWindow')

window.appActions = appActions
let alreadyPinnedSites = new Immutable.Set()

class Window extends React.Component {
  constructor (props) {
    super(props)
    // initialize appState from props
    // and then listen for updates
    this.appState = appStoreRenderer.state
    this.windowState = Immutable.fromJS(this.props.initWindowState) || windowStore.getState()
    this.state = {
      immutableData: {
        windowState: this.windowState,
        appState: this.appState
      }
    }
    if (this.props.initWindowState) {
      windowActions.setState(this.windowState)
    }

    this.onChange = this.onChange.bind(this)
    this.onAppStateChange = this.onAppStateChange.bind(this)
    windowStore.addChangeListener(this.onChange)
    appStoreRenderer.addChangeListener(this.onAppStateChange)
  }

  componentWillMount () {
    if (!this.props.initWindowState || this.props.initWindowState.frames.length === 0) {
      if (this.props.frames.length === 0) {
        appActions.createTabRequested({})
      } else {
        this.props.frames.forEach((frame, i) => {
          if (frame.guestInstanceId) {
            appActions.newWebContentsAdded(currentWindowId, frame)
            return
          }
          appActions.createTabRequested({
            url: frame.location,
            partitionNumber: frame.partitionNumber,
            isPrivate: frame.isPrivate,
            active: i === 0,
            windowId: currentWindowId
          })
        })
      }
    }
  }

  render () {
    let classes = {}
    classes['windowContainer'] = true

    const platformClasses = getPlatformStyles()
    platformClasses.forEach((className) => {
      classes[className] = true
    })

    // Windows puts a 1px border around frameless window
    // For Windows 10, this defaults to blue. When window
    // becomes inactive it needs to change to gray.
    if (classes['win10']) {
      classes['inactive'] = !this.windowState.getIn(['ui', 'hasFocus'])
    }

    return <div id='windowContainer' className={cx(classes)} >
      <Main windowState={this.state.immutableData.windowState}
        appState={this.state.immutableData.appState} />
    </div>
  }

  componentWillUnmount () {
    windowStore.removeChangeListener(this.onChange)
    appStoreRenderer.removeChangeListener(this.onAppStateChange)
  }

  shouldComponentUpdate (nextProps, nextState) {
    return nextState.immutableData !== this.state.immutableData
  }

  onChange () {
    this.windowState = windowStore.getState()
    this.setState({
      immutableData: {
        windowState: this.windowState,
        appState: this.appState
      }
    })
  }

  onAppStateChange () {
    this.appState = appStoreRenderer.state
    this.setState({
      immutableData: {
        windowState: this.windowState,
        appState: this.appState
      }
    })

    if (!this.props.includePinnedSites) {
      return
    }

    const pinnedSites = this.appState.get('sites').filter((site) => site.get('tags').includes(SiteTags.PINNED))

    // There could be some recently pinned tabs by the user in the current window
    // Check for them here and mark them as already pinned.
    this.appState.get('tabs')
      .filter((tab) => tab.get('pinned') &&
        tab.get('windowId') === currentWindowId)
      .map((tab) => getSiteKey(getDetailFromTab(tab)))
      .forEach(alreadyPinnedSites.add.bind(alreadyPinnedSites))

    // Check for new pinned sites which we don't already know about
    const sitesToAdd = pinnedSites.filter((site) =>
        !alreadyPinnedSites.find((pinnedSiteKey) => pinnedSiteKey === getSiteKey(site)))
    console.log('----sitesToAdd', sitesToAdd.toJS())
    /*
    const sitesToClose = alreadyPinnedSites.filter((pinnedSitekey) =>
        !pinnedSites.find((pinnedSite) => pinnedSiteKey === getSiteKey(pinnedSite)))
        */

    sitesToAdd.sort(siteSort).forEach((site) => {
      alreadyPinnedSites = alreadyPinnedSites.add(getSiteKey(site))
      appActions.createTabRequested({
        url: site.get('location'),
        partitionNumber: site.get('partitionNumber'),
        pinned: true,
        windowId: currentWindowId
      })
    })

    const frames = this.windowState.get('frames')
      /*
    const framesToClose = frames.filter((frame) =>
        sitesToClose.find((site) =>
            frame.get('pinnedLocation') === site.get('location') &&
            (frame.get('partitionNumber') || 0) === (site.get('partitionNumber') || 0)))
    framesToClose.forEach((frameProps) => {
      sitesToAdd.delete(getSiteKey(getDetailFromFrame(frameProps)))
      windowActions.closeFrame(frames, frameProps, true)
    })
    */
  }
}

Window.propTypes = { appState: React.PropTypes.object, frames: React.PropTypes.array, initWindowState: React.PropTypes.object }

module.exports = Window
