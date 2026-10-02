import YarlLightbox from 'yet-another-react-lightbox'
import Captions from 'yet-another-react-lightbox/plugins/captions'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import 'yet-another-react-lightbox/styles.css'
import 'yet-another-react-lightbox/plugins/captions.css'
import type { LightboxProps } from './Lightbox'
import styles from './Lightbox.module.scss'

// Only ever loaded through the lazy wrapper: yarl, its plugins and CSS stay out of the initial chunk.
export default function LightboxImpl({ slides, index, onClose, onView }: Omit<LightboxProps, 'open'>) {
  return (
    <YarlLightbox
      open
      className={styles.lightbox}
      slides={slides}
      index={index}
      close={onClose}
      on={{ view: ({ index: i }) => onView?.(i) }}
      plugins={[Zoom, Captions]}
      zoom={{ maxZoomPixelRatio: 3, scrollToZoom: true }}
      captions={{ descriptionTextAlign: 'center', descriptionMaxLines: 4 }}
      controller={{ closeOnBackdropClick: true, closeOnPullDown: true }}
      carousel={{ finite: slides.length < 3, preload: 2 }}
    />
  )
}
