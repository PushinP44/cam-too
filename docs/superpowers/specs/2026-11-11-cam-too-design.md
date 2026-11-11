# cam-too: design

Status: draft, waiting for the author's approval. Written 2026-11-11.

## Intent

Small vintage digital cameras (CCD compacts, "digicams") have a tone people
love. Many of their owners post sets of 10 to 12 photos to Instagram and also
want film looks on top of that tone. Today the author copies the photos off a
Nikon Coolpix S3000 and edits each set by hand in iPhone Photos or Lightroom.

cam-too is a free, open-source web app (later also an installable phone app)
that turns a whole set of photos into one consistent, Instagram-shaped set in
a few taps. It runs entirely in the browser. A photo never leaves the device.

It was inspired by M-Film, a Canon-only film simulator built on Magic Lantern
(GPL-2.0). cam-too shares the idea of film looks with grain and halation, and
differs in everything else: it works on ordinary JPEG/HEIC photos, from any
camera or phone, on the web, under the MIT licence. No M-Film code is used and
none should be copied.

## Who it is for

- First: the author, who shoots JPEG on an S3000 and posts 10 to 12 photos at
  a time.
- Then: anyone with a digicam or a phone who wants those looks, and people who
  contribute cameras and films.

## Goals

1. Open a set of photos (10 to 12 typical, up to 20) and get back an edited set
   with one look, consistent across the set, shaped for Instagram.
2. Two looks that stack. The **camera look** makes any photo look as if it was
   shot on a given camera (the S3000 first). The **film look** is a film style.
   Use either or both, camera first. A photo that already comes from that
   camera (read from its metadata) skips the camera look by default, so the
   tone is not applied twice.
3. A small starter set of film looks (about 8) made for this project.
4. **Make your own film** from reference photos (an approximate copy of their
   colour and tone) or from before/after pairs (an exact fit). Saved on the
   device. Export and import as `.cube`.
5. Runs in the browser, no upload, works offline after the first load, and is
   an installable web app so a phone app can later be a thin wrapper.
6. Looks are data. Adding a camera or a film means adding files, not changing
   the engine. The format is documented.
7. After a look is applied the photo is finished. The author does not adjust
   photos by hand afterwards, so the look and the automatic balancing must do
   the job.

## Non-goals (v1)

- Accounts, cloud storage, a server, or any analytics that touch photos.
- Posting directly to Instagram.
- RAW files and video.
- An editor. No exposure or curve tools. The only manual control on a photo
  is dragging its crop.
- A native phone app (later).
- Exact replicas of real film stocks or real camera sensors. The aim is
  "looks like", never "is".
- Copying grain or halation from reference photos. Own films copy colour and
  tone only.
- Machine learning or generative features.
- Camera profiles other than the S3000 (more come later).

## Anti-goals (a failure even if it technically works)

- Any photo data leaving the device.
- A set that only matches after fixing photos by hand.
- A phone that freezes or runs out of memory on a set of 12.
- A project that is hard to contribute to. Cloning and running should take
  minutes with few dependencies. (An earlier test script broke because scipy
  was built against an older numpy.)
- Claiming a look is the real film or the real camera, or using brand names as
  if cam-too were affiliated with them.
- Bundling data whose licence is unclear (see Constraints).

## What the author decided

- Web first, phone app after. Repo: `PushinP44/cam-too`, public, MIT.
- Start with the Nikon Coolpix S3000. Other cameras (maybe the top 10 vintage
  digicams) are decided later.
- A camera profile means "make any photo look like it was shot on that
  camera", and it stacks with film, so people keep the camera tone they like
  and add film on top.
- Edit screen: layout A, stacked, mobile first (photo on top, controls under
  it).
- Posts are 10 to 12 photos at a time.
- Users can upload reference photos and make their own film.
- A photo that does not fit the chosen post shape is cropped to it, and the
  author can drag the photo to adjust the crop. Photos are not shrunk to fit
  inside borders.
- No manual adjustment after the look. This is my reading of the author's
  "nah" and still needs their confirmation.

## Constraints

- **Licence:** MIT (already in the repo). Everything bundled must be
  compatible, and its source and licence recorded.
- **No bundled third-party LUT packs in v1.** M-Film uses the Film-Luts repo,
  which is a repackaging of G'MIC's film colour tables. Its README says the
  maintainer does not claim ownership of the LUTs and that they may carry other
  people's copyright and trademarks, so its MIT licence may not cover the
  colour data. cam-too makes its own looks. A user may import their own `.cube`
  file locally. Revisit only if provenance is cleared.
- **Runtime:** browser only, TypeScript, static hosting, no backend. Latest two
  versions of iOS Safari and Android Chrome, plus desktop Chrome, Safari and
  Firefox.
- **Instagram shape.** Several 2026 size guides agree 4:5 at 1080x1350 is the
  safest feed shape. They disagree on whether 3:4 uploads are accepted and on
  the carousel limit (10 or 20 reported). One guide says the first slide sets
  the ratio for the whole carousel. So: default 4:5, one shape for the whole
  set, up to 20 photos, and recheck Instagram's own help pages before release.
- **Phone memory.** Never hold 12 full-size decoded photos at once. Previews
  are downscaled. Full-quality processing runs one photo at a time at save.
  iOS Safari has strict canvas memory limits.
- **Photo handling.** Apply EXIF orientation. Convert Display P3 (common on
  iPhones) to sRGB correctly. Read the camera model and date from EXIF. Strip
  location data from the output.
- **HEIC.** Some browsers cannot decode it. Provide a fallback decoder that is
  loaded only when needed.
- **Output.** sRGB JPEG, high quality. Grain and sharpening are tuned at the
  output size, because Instagram resizes and recompresses.

## How it works

### The pipeline (per photo)

decode, then orientation and colour space, then automatic balance (exposure and
white balance toward what the looks expect), then camera look, then film look
(tone, colour, halation, vignette), then crop to the chosen shape (centred, or where the author dragged it), then resize,
then grain at output size, then encode. Grain comes last so it is tuned to the
final pixels.

### Looks are data

A look is a small, human-readable, versioned file with an optional LUT. Kinds:
camera, film, user. Likely fields: name, kind, tone curve, colour (matrix or
LUT), softness, noise, grain (amount, size, colour), halation (threshold,
tint, amount, radius), vignette, credits and licence. The builder designs the
exact format. It must be validated, documented, and come with an example.

### Make your own film

- Input: 1 to 6 reference photos, or before/after pairs.
- Output: a look with colour and tone only.
- Behaviour: a preview before saving, a strength slider, a smooth result with
  no banding or posterisation, and deterministic output. The screen says in
  plain words that the copy is approximate and works best with several
  references of a similar subject.
- References only: match the colour and brightness distribution of the
  references to the target in a perceptual colour space, then compress that
  into a smooth LUT.
- Pairs: fit curves or a LUT that map the before photos to the after photos,
  with smoothing.
- The method is the builder's choice. These are guides.

### Camera profiles

v1 ships the S3000 profile, tuned from the author's S3000 JPEGs. Later, a
calibration tool built on the same fitting as own-film lets owners of other
cameras create a profile from paired shots (the same scene on the camera and on
a phone). That tool is after v1.

## Screens

From the mockups the author reviewed (layout A).

1. **Start.** Add up to 20 photos from the camera roll or files. "Or try a
   sample photo" (a sample we are free to publish).
2. **Edit.** Preview on top with a counter (1 / 12). A strip of every photo.
   Camera look row (Original, Coolpix S3000, more soon). Film row (None, the
   starters, "Your film +"). A film strength slider. Hold the photo to see the
   original. Drag the photo to move its crop; a frame shows the chosen shape.
   "Save all".
3. **Save.** Shape chips (4:5 default, 1:1, 9:16 story, original). Extras: an
   orange date stamp from the EXIF date, and a full-size file instead of the
   Instagram size. Save or Share: a share sheet on phones with several files,
   download otherwise.
4. **Make your own film.** Reference row, a hint about before/after pairs, a
   before and after preview, strength, a name, "Save film", and export as
   `.cube`.

On a computer, the same screens with the controls in a side panel (a guess, to
be confirmed). The mockups use the author's personal photo and are not part of
this repo.

## What the spike showed

A throwaway script ran on one S3000 JPEG (a night street scene).

- A film curve, grain, halation, vignette and a 2:3 crop already read as film
  from a plain JPEG.
- Grain at full resolution was too coarse, and whites went milky, until the
  curve and grain were retuned.
- Clipped highlights cannot be recovered. Faces stay soft, because grain does
  not add detail. An orange neon sign lost colour in the warm look.
- A cool film look made skin pale. Look tuning needs a skin-tone check.
- Smoothing colour noise before adding grain looked better than grain on top
  of camera noise reduction.
- Dependencies must stay minimal.

## Done means (v1)

1. The author takes 12 S3000 JPEGs, picks a film, and saves an Instagram-shaped
   set on iPhone Safari in a couple of minutes, without Photos or Lightroom.
   The set looks consistent.
2. A stranger can clone and run the project in two commands, and add a film by
   adding data files, following the docs.
3. An own film from 3 references on a real phone gives a plausible look in
   about 10 seconds.
4. An automated check shows no network request carries photo data.
5. Unit tests cover the colour and tone maths, and golden-image tests cover
   every shipped look.
6. A set of 12 photos does not crash an iPhone-class device.
7. Side by side, a phone photo run through the S3000 look is close to a real
   S3000 photo of the same scene, as judged by the author. This is how the
   camera look is verified.
8. A set with mixed exposures comes out with similar overall brightness. The
   builder sets the threshold.
9. Dragging a photo moves its crop, and the saved file matches the crop shown
   in the preview, for portrait and landscape photos in the same set.

## Calls made without the author (to check)

- TypeScript, a static site, an installable web app first.
- 4:5 at 1080x1350 as the default, with 1:1, 9:16 and original.
- Hold the photo to compare with the original.
- Skip the camera look when the EXIF camera model matches.
- Our own looks only, with no bundled third-party LUTs.
- About 8 starter films, with descriptive names and no brand names.
- Own film supports both references and before/after pairs, with `.cube`
  export and import.
- Up to 20 photos per set.
- Location data stripped from output.
- An optional orange date stamp from the EXIF date.
- Own films are stored on the device only.
- v1 includes own-film. The camera calibration tool comes after v1.
- The crop starts centred. Dragging moves it, with no zoom in v1.
- The "Original" shape is offered only when every photo in the set has the same
  shape, because a carousel uses one shape.
- Starter film styles to aim for: warm portrait, cool tungsten night, classic
  black and white, vivid slide, faded pastel, cross-processed.
- The date stamp is left off when a photo has no EXIF date.
- I read this document as the builder instead of dispatching a reviewer.

## Left to the builder

The framework and UI library. The rendering approach (WebGL2, canvas or WASM)
and phone performance. The exact starter films and their names. The look file
format. The colour-transfer method. The HEIC strategy. Hosting. Test tooling.
Project structure. The grain model.

## Needed from the author

- About 20 S3000 JPEGs: daylight, indoor, night and flash. Done-means item 7
  needs the same scenes also shot on a phone. Without those pairs the S3000
  look can only be tuned by eye and cannot be verified.
- Whether one or two of them may be published as sample photos. Otherwise the
  builder uses a freely licensed sample.
- Later: which other cameras to add.

## Risks to check early

- iOS Safari memory and canvas limits with 12 photos.
- HEIC support across browsers.
- Sharing several files at once on iOS, with a download fallback.
- Display P3 to sRGB conversion.
- Instagram size and carousel limits (recheck).
- How well own-film copies tone when references differ a lot from the target.
- The licence of anything a user imports.
