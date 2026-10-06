# OpenCV OMR Reader Rebuild

**Status:** Draft for review

**Date:** 2026-10-05

## Summary

Replace the current answer-bubble interpretation logic in the CORRIGE+ correction API with a new OpenCV OMR reader. The replacement becomes the primary runtime reader after its validation gates pass. Keep the existing API, QR resolution, image download, document-quality checks, answer-sheet format, persistence, and correction flow intact unless integration requires a narrow contract adjustment.

The central design change is to stop searching the page for likely answer rows and instead reconstruct the printed card geometry, then measure ink only at the known answer locations.

## Goals

- Reliably map printed answer bubbles to their photographed positions despite page translation, rotation, scale, and perspective.
- Read the existing CORRIGE+ answer-sheet layouts from explicit layout profiles, rather than inferring coordinates from question count alone.
- Classify each question as answered, blank, multiple-marked, or uncertain, with confidence information sufficient for review.
- Preserve the current API response and downstream correction behavior wherever practical.
- Validate the reader using synthetic sheets with known answers and a curated set of manually verified real photographs.

## Non-goals

- Replacing or redesigning the PDF answer-sheet appearance in the first implementation phase.
- Replacing QR decoding, student/evaluation lookup, storage, dispatch, or grading logic.
- Using general OCR, a language model, or a cloud vision service to identify marks.
- Running both readers as competing production implementations after the new reader is accepted. The previous implementation may remain available in Git history or as an offline comparison fixture, but it is not the primary runtime reader.
- Automatically deciding ambiguous or multiple marks by guessing the student's intent.

## Proposed processing flow

1. The existing API receives the image and evaluation/card metadata. The QR continues to identify or resolve the existing record; layout details are supplied from the trusted evaluation configuration/request rather than relying on question count to guess the geometry.
2. Decode the image and retain the current document-quality checks.
3. Detect the four printed corner fiducials. Validate that exactly one plausible marker exists in each expected page corner, order them consistently, and reject or flag detections that are missing, duplicated, or geometrically implausible.
4. Apply a perspective transform to a canonical page coordinate system. Preserve the A4 aspect ratio; for example, use 1600 × 2263 pixels or another documented resolution with the same aspect ratio. Do not stretch the page to an unrelated aspect ratio.
5. Resolve an explicit `layout_profile_id` and load its answer-bubble geometry. The profile must describe the actual printed layout, including columns, answer rows, alternatives, and any subject-block spacing.
6. Sample a small ROI centered on each expected bubble. Estimate local paper/background appearance and measure mark evidence inside the bubble relative to that local baseline. No page-wide search for bubble-like shapes is performed.
7. Convert per-option measurements into a question-level result: `answered`, `blank`, `multiple`, or `uncertain`, with selected option(s), confidence, and diagnostic measurements.
8. Return the result through the existing correction API contract. Low-confidence or geometrically invalid cases are surfaced for review and are never silently converted into a guessed answer.

## Layout profile and coordinate ownership

Introduce an explicit layout profile identifier in the reader configuration, conceptually:

```text
layout_profile_id: "corrige-plus-40-subject-blocks-v1"
canonical_page: { width: 1600, height: 2263 }
fiducials: [top_left, top_right, bottom_left, bottom_right]
questions: per-question list of option centers and expected bubble radius
```

The examples `compact_10`, `standard_20`, and `standard_40` are useful profile names only if they correspond to real, distinct printed geometries. The profile ID—not the total question count—is the authoritative geometry selector. Question count and alternatives count remain validation inputs.

The existing PDF renderer is the source of truth for the printed card. The reader profile must match its actual geometry, including the current four corner marker centers, answer start position, column spacing, bubble spacing/radius, and any extra spacing caused by subject headings. These values currently exist in more than one place; the implementation must prevent silent drift by either sharing a geometry definition or adding a test that compares the profile against the PDF renderer's geometry. Do not change the printed layout as an incidental part of the reader rewrite.

The current request already carries layout-related information such as layout version, question count, alternatives count, and subject blocks. The implementation should add or derive an explicit profile identifier at the trusted API boundary and pass it through to the reader. QR payload changes are not required unless inspection proves the existing lookup cannot resolve the correct profile.

## Mark measurement and classification

For each known bubble ROI, compute mark evidence using a combination of:

- dark/colored ink coverage within the inner bubble area;
- local contrast relative to nearby unmarked paper;
- separation between the strongest and next-strongest alternatives;
- expected bubble shape/location consistency after normalization.

Avoid relying on a single fixed grayscale threshold. Paper tint, uneven lighting, pencil/pen color, and shadows vary between photos. Keep the initial measurements explainable and deterministic; tune thresholds against labeled samples rather than adding a heavyweight model.

Question-level behavior:

- `blank`: no option has sufficient mark evidence.
- `answered`: one option has sufficient evidence and is separated from the runner-up by the calibrated margin.
- `multiple`: more than one option has clear mark evidence.
- `uncertain`: evidence is weak, conflicting, or near a decision boundary, or page/layout geometry is not trustworthy.

Confidence must be calibrated from validation data. It should not be presented as a probability until calibration supports that interpretation. Preserve per-option scores and a reason code in diagnostics so a reviewer can understand why a result was flagged.

## Integration boundaries

- Keep the current endpoint, signed-image download, QR decoding, and answer serialization stable where possible.
- Replace the current bubble-reading call in the processing pipeline with the new reader behind a small, testable interface.
- Keep orientation/perspective handling in one clearly defined place so an image is not transformed twice or scored in coordinates from a different orientation.
- Preserve subject/question mapping and the existing answer contract; profile geometry determines where to sample, while existing metadata determines which question and subject each row represents.
- Return diagnostics such as profile ID, normalization dimensions, detected fiducial coordinates, per-question classifications, confidence, and reason codes in internal logs or a debug response, without exposing student-sensitive image data unnecessarily.
- Keep the old algorithm out of the normal runtime path once the new reader passes acceptance. It may be retained as an offline comparison utility if useful and clearly isolated.

## Validation plan

### Synthetic tests

Generate cards from the same geometry/profile source used by the PDF renderer, with a recorded ground-truth answer key. Cover:

- each option position A–E and every row/column boundary;
- blank questions, single marks, deliberate multiple marks, faint marks, and stray marks near but outside bubbles;
- pencil and colored-pen marks, tinted paper, uneven illumination, blur, compression, and realistic noise;
- translation, rotation, scale, and perspective changes, including small off-center captures;
- each supported profile and subject-block arrangement.

Acceptance gates: all clean, untransformed synthetic cases must match ground truth exactly; blank regions must not produce false answers; deliberately multiple-marked cases must be classified as `multiple`; ambiguous synthetic cases must be `uncertain`, not guessed. Geometric/profile tests must verify that known bubble centers map to the intended ROIs after normalization.

### Real-photo validation

Create a small, manually checked dataset from the supplied card-photo types, with names and other student identifiers excluded from test fixtures where possible. Annotate the intended marked bubbles and flag genuinely ambiguous cases. Report exact answer accuracy, blank/multiple/uncertain classification counts, and review rate per profile. Set numerical production targets only after this baseline is measured; do not claim real-photo accuracy based only on synthetic results.

### Regression and integration

- Verify the API response schema and correction workflow remain compatible.
- Verify supported existing layouts still render and resolve to the right profile.
- Verify missing/invalid QR, missing fiducials, and unsupported profiles fail safely with actionable errors.
- Run the correction API test suite and relevant PDF/layout tests before switching the new reader on by default.

## Rollout and recovery

Implement and validate this reader on the dedicated `codex/opencv-omr-rebuild` branch. Keep the current production branch untouched during development. The new reader becomes the primary path on this branch only after synthetic, real-photo, and integration gates pass. If a regression appears, revert the reader integration commit or restore the prior branch/release; do not discard the existing service or user data as part of rollback.

## Decisions fixed by this design

- The rebuilt OpenCV reader is intended to replace the existing bubble interpreter and become the primary reader, not remain a permanent side-by-side runtime experiment.
- Four page fiducials and a canonical perspective-normalized page are the geometric reference.
- Bubble positions come from an explicit profile that matches the printed PDF; question count is validation metadata, not a layout selector.
- Ambiguous readings go to review rather than being guessed.
- The first phase preserves the existing card design and surrounding application flow.
