/**
 * Default site copy. The Content table can override any key at runtime;
 * when a key is missing the app falls back to these sentences.
 * The seed script inserts these values, so edit here to change both.
 */
export const CONTENT_DEFAULTS: Record<string, string> = {
  'home.headline': 'Heart rate from a face video, in your browser',
  'home.lead':
    'MotionPulse estimates pulse from ordinary camera footage and flags when motion may affect the number. For learning and research — not a medical device.',
  'home.how.title': 'How a session works',
  'home.how.step1.heading': '1. Add a face clip',
  'home.how.step1.body':
    'Open the scan page, then use your webcam, upload a short video, or run the built-in sample. Video stays on this device.',
  'home.how.step2.heading': '2. Track the face',
  'home.how.step2.body':
    'The app finds your face and samples color from forehead and cheek regions while you scrub the timeline.',
  'home.how.step3.heading': '3. Read the vitals',
  'home.how.step3.body':
    'A webcam capture lasts 10 seconds, then the camera stops and heart rate, an experimental respiratory rate, and signal trust appear once.',
  'home.feed.title': 'Public results',
  'home.feed.lead':
    'Shared scans list a heart rate, an experimental respiratory rate, the signal label, and risk. A small face thumb may appear. No video is stored.',
  'home.vitals.title': 'What this camera reports',
  'home.vitals.note': 'Blood oxygen and blood pressure are not measured here.',
  'home.demo.title': 'Demo and Local lab',
  'footer.line': 'Educational remote-PPG demo — not a medical device.',
  'scan.disclaimer': 'Educational scan demo — not a medical device.',
  'scan.save_metrics': 'on',
  'scan.offer_video_optin': 'off',
  'site.maintenance_note': '',
  'nav.feed': 'Feed',
  'nav.scan': 'Scan',
  'nav.glossary': 'Glossary',
  'nav.how': 'How it works',
  'nav.demo': 'Demo',
  'nav.lab': 'Local lab',
  'nav.signin': 'Sign in',
  'cta.scan': 'Scan yourself',
  'cta.sample': 'Try sample',
}

/** Content keys rendered as on/off switches in the admin. */
export const SWITCH_KEYS = ['scan.save_metrics', 'scan.offer_video_optin']
