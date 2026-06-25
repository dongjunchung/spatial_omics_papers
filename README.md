# Spatial Omics Research Digest

Daily notes on spatial omics data modeling papers, with compact visual summaries for method papers and resource tables for atlas or portal papers.

## Latest digest

[Read the June 25, 2026 digest](digests/2026-06-25.md)

Today's update is a focused revisit digest because the scan did not surface a strong new post-June-24 modeling paper. It highlights three statistical methods that remain useful baselines for current spatial AI and multimodal modeling work:

- [BASS](digests/2026-06-25.md#1-bass-multi-scale-and-multi-sample-analysis-enables-accurate-cell-type-clustering-and-spatial-domain-detection-in-spatial-transcriptomic-studies): Bayesian multi-scale, multi-sample inference of cell types and spatial domains.
- [scGCO](digests/2026-06-25.md#2-identification-of-spatially-variable-genes-with-graph-cuts): graph-cut optimization of an HMRF objective for spatially variable gene detection.
- [SOMDE](digests/2026-06-25.md#3-somde-a-scalable-method-for-identifying-spatially-variable-genes-with-self-organizing-map): self-organizing-map compression followed by scalable spatial variance testing.

## Emerging themes

- Statistical hierarchy, graph optimization, and spatial compression remain important complements to neural representation learning.
- Spatially variable gene detection should be matched to the biology: boundaries, gradients, regions, and sparse niches favor different model assumptions.
- For method papers, diagrams should expose the statistical object being inferred rather than only listing workflow steps.
- For data-resource or atlas papers, compact tables are more useful than schematic diagrams.

## Archive

See the [digests](digests/) directory for previous updates.

## Automation notes

The recurring digest tracks both newly released work and older papers that are worth revisiting because they are foundational, technically distinctive, newly relevant, underappreciated, or previously missed. Method papers receive original SVG visual abstracts; data resources receive compact resource tables.
