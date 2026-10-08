# Changelog

## October 7, 2026

### Added

- Each icon has its own page, such as /icons/bell/. The page shows the icon large, the controls, Copy and Download, the SVG code, a CDN link, other words for the icon, and 8 related icons.
- Search finds icons by other words. For example, "notification" finds the bell. Each icon has 3 to 8 of these words.
- 12 category pages, such as /categories/arrows/. The links to them are at the bottom of every page.
- Each icon has a plain SVG file at /svg/<name>.svg and a markdown page at /icons/<name>.md.
- You can load each icon from jsDelivr. The docs and each icon page show the link.
- A page for addresses that do not exist.

### Changed

- Square corners are now the default. The Square button comes first, and Reset goes back to Square.
- The page uses new fonts. Titles and text use Inter. Buttons and numbers use Paper Mono. The style comes from docs.typesafe.ai.
- The Copy button says "Copied" with no exclamation mark. It goes back to "Copy" after 3 seconds.
- The icon on the Copy button now has square corners.
- The page loads its fonts from the site itself. It no longer asks Google Fonts.
- The footer text is easier to read.
- The picture you see when you share a link uses the new title font. Each icon page has its own picture.

### Fixed

- If you clicked Copy two times fast, the button stayed stuck on "Copied". Now it always goes back to "Copy".
- 15 icons look better:
  - **gear** has 6 wide teeth instead of 12 thin ones.
  - **picture** has a smaller sun that no longer touches the mountain.
  - **user-add** and **user-minus** have the plus and minus next to the head, so they do not run into the shoulder.
  - **sliders** lines stop at each knob instead of going through it. The knobs are a little bigger.
  - **git-branch** and **git-merge** lines join the main line instead of running into a circle.
  - **exposure** has a diagonal line that stays inside the box.
  - **key** and **rain** no longer go past the top edge.
  - **heart**, **wifi**, **rainbow**, **volume** and **volume-off** are now in the middle of the box. The heart is a little bigger.

## August 14, 2026

### Fixed

- The download icon on each card was too big. It is now the same size as the Copy icon.
- The stroke weight slider is easier to grab on a phone.

## August 13, 2026

- First release: 170 free SVG icons, with a stroke weight slider and a corners switch.
- The site went live at icons.evanpizzolato.com.
