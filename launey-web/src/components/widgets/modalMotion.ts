export const MODAL_EASE = [0.2, 0.8, 0.2, 1] as const
export const MODAL_EXIT_EASE = [0.4, 0, 1, 1] as const
export const MODAL_DURATION = 0.22

export function getModalBackdropAnimation(shouldReduceMotion: boolean) {
  if (shouldReduceMotion) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0, transition: { duration: 0.11 } },
    }
  }

  return {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0, transition: { duration: 0.13, ease: MODAL_EXIT_EASE } },
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
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: {
        opacity: 0,
        transition: { duration: 0.11 },
      },
    }
  }

  return {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: {
      opacity: 0,
      transition: { duration: 0.14, ease: MODAL_EXIT_EASE },
    },
  }
}

export const folderItemsContainerVariants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      delayChildren: 0.075,
      staggerChildren: 0.016,
    },
  },
  exit: {
    opacity: 1,
    transition: {
      staggerChildren: 0.014,
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
      duration: 0.17,
      ease: MODAL_EASE,
    },
  },
  exit: {
    opacity: 0,
    y: 6,
    transition: {
      duration: 0.11,
      ease: MODAL_EASE,
    },
  },
}
