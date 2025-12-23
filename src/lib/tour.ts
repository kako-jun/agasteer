import { driver, type DriveStep, type Driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { get } from 'svelte/store'
import { _ } from './i18n'
import { isTourShown as isTourShownFromStorage, setTourShown } from './data/storage'

/** ツアーが既に表示済みかどうか */
export const isTourShown = isTourShownFromStorage

/** ツアーを表示済みとしてマーク */
export function markTourShown(): void {
  setTourShown(true)
}

/** ツアーのステップを取得（i18n対応） */
function getTourSteps(): DriveStep[] {
  const t = get(_)
  return [
    {
      popover: {
        title: t('tour.welcome.title'),
        description: t('tour.welcome.description'),
      },
    },
    {
      element: '#tour-create-note',
      popover: {
        title: t('tour.createNote.title'),
        description: t('tour.createNote.description'),
        side: 'top',
        align: 'start',
      },
    },
    {
      element: '#tour-create-leaf',
      popover: {
        title: t('tour.createLeaf.title'),
        description: t('tour.createLeaf.description'),
        side: 'top',
        align: 'start',
      },
    },
    {
      element: '#tour-save',
      popover: {
        title: t('tour.save.title'),
        description: t('tour.save.description'),
        side: 'top',
        align: 'end',
      },
    },
    {
      element: '#tour-pull',
      popover: {
        title: t('tour.pull.title'),
        description: t('tour.pull.description'),
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: '#tour-settings',
      popover: {
        title: t('tour.settings.title'),
        description: t('tour.settings.description'),
        side: 'bottom',
        align: 'end',
      },
    },
    {
      popover: {
        title: t('tour.offline.title'),
        description: t('tour.offline.description'),
      },
    },
    {
      popover: {
        title: t('tour.priority.title'),
        description: t('tour.priority.description'),
      },
    },
    {
      popover: {
        title: t('tour.finish.title'),
        description: t('tour.finish.description'),
      },
    },
  ]
}

let driverInstance: Driver | null = null

/** ツアーを開始 */
export function startTour(): void {
  if (driverInstance) {
    driverInstance.destroy()
  }

  const t = get(_)

  driverInstance = driver({
    showProgress: true,
    animate: true,
    allowClose: true,
    stagePadding: 8,
    stageRadius: 8,
    popoverClass: 'agasteer-tour-popover',
    nextBtnText: t('tour.next'),
    prevBtnText: t('tour.prev'),
    doneBtnText: t('tour.done'),
    progressText: '{{current}} / {{total}}',
    steps: getTourSteps(),
    onDestroyed: () => {
      markTourShown()
      driverInstance = null
    },
  })

  driverInstance.drive()
}

/** ツアーを強制的にリセット（デバッグ用） */
export function resetTour(): void {
  setTourShown(false)
}
