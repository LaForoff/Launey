export const MODAL_EASE = [0.2, 0.8, 0.2, 1] as const
export const MODAL_DURATION = 0.24
const MODAL_SURFACE_FILTER = 'blur(32px) saturate(1.15)'

export function getModalBackdropAnimation(shouldReduceMotion: boolean) {
  if (shouldReduceMotion) {
    return {
      initial: { opacity: 1 },
      animate: { opacity: 1 },
      exit: { opacity: 0, transition: { duration: 0.08 } },
    }
  }

  return {
    initial: { opacity: 1 },
    animate: { opacity: 1 },
    exit: { opacity: 0, transition: { duration: 0.12, ease: MODAL_EASE } },
  }
}

export function getFolderBackdropAnimation(shouldReduceMotion: boolean) {
  if (shouldReduceMotion) {
    return getModalBackdropAnimation(true)
  }

  return {
    initial: { opacity: 1 },
    animate: { opacity: 1 },
    exit: {
      opacity: 0,
      transition: {
        duration: MODAL_DURATION * 0.45,
        delay: MODAL_DURATION * 0.55,
        ease: MODAL_EASE,
      },
    },
  }
}

export function getCenteredModalAnimation(shouldReduceMotion: boolean) {
  if (shouldReduceMotion) {
    return {
      initial: { opacity: 0, backdropFilter: MODAL_SURFACE_FILTER },
      animate: { opacity: 1, backdropFilter: MODAL_SURFACE_FILTER },
      exit: { opacity: 0, backdropFilter: MODAL_SURFACE_FILTER },
    }
  }

  return {
    initial: { opacity: 0, scale: 0.96, backdropFilter: MODAL_SURFACE_FILTER },
    animate: { opacity: 1, scale: 1, backdropFilter: MODAL_SURFACE_FILTER },
    exit: { opacity: 0, scale: 0.96, backdropFilter: MODAL_SURFACE_FILTER },
  }
}

export const folderItemsContainerVariants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      delayChildren: 0.075,
      staggerChildren: 0.022,
    },
  },
  exit: {
    opacity: 1,
    transition: {
      staggerChildren: 0.018,
      staggerDirection: -1,
    },
  },
}

export const folderItemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.22,
      ease: MODAL_EASE,
    },
  },
  exit: {
    opacity: 0,
    y: 6,
    transition: {
      duration: 0.14,
      ease: MODAL_EASE,
    },
  },
}
