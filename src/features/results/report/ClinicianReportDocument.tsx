import {
  Circle,
  Document,
  Font,
  Line,
  Page,
  Polyline,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import path from "node:path";
import type {
  ClinicianReportModel,
  ReportHistoryPoint,
} from "./report-model";

const fontPackageRoot = path.join(
  process.cwd(),
  "node_modules",
  "@fontsource",
  "source-sans-3",
);
const sourceSansFont = (weight: 400 | 600 | 700) =>
  path.join(
    fontPackageRoot,
    "files",
    `source-sans-3-latin-${weight}-normal.woff`,
  );

Font.register({
  family: "Source Sans 3",
  fonts: [
    {
      src: sourceSansFont(400),
      fontWeight: 400,
    },
    {
      src: sourceSansFont(600),
      fontWeight: 600,
    },
    {
      src: sourceSansFont(700),
      fontWeight: 700,
    },
  ],
});

Font.registerHyphenationCallback((word: string) => [word]);

const colors = {
  canvas: "#fbfaf6",
  surface: "#ffffff",
  surfaceMuted: "#f0f3ed",
  ink: "#082d38",
  inkSoft: "#465f68",
  inkFaint: "#6c7d82",
  teal: "#004e4d",
  tealSoft: "#126c67",
  sage: "#718f78",
  sageLight: "#cbd4c9",
  border: "#cfd7d1",
  fewer: "#8ea992",
  some: "#e4ba62",
  more: "#dc7b70",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 42,
    paddingRight: 46,
    paddingBottom: 46,
    paddingLeft: 46,
    color: colors.ink,
    backgroundColor: colors.canvas,
    fontFamily: "Source Sans 3",
    fontSize: 9.2,
    lineHeight: 1.42,
  },
  pageHeader: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
    borderBottomWidth: 0.7,
    borderBottomColor: colors.border,
  },
  brand: { color: colors.teal, fontSize: 15, fontWeight: 700 },
  headerMeta: { color: colors.inkFaint, fontSize: 8.2 },
  titleBlock: { marginTop: 28 },
  sectionLabel: {
    color: colors.tealSoft,
    fontSize: 8.3,
    fontWeight: 700,
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  title: { marginTop: 6, fontSize: 29, fontWeight: 700, lineHeight: 1.03 },
  subtitle: { width: "78%", marginTop: 9, color: colors.inkSoft, fontSize: 11.2 },
  metaGrid: {
    display: "flex",
    flexDirection: "row",
    gap: 8,
    marginTop: 22,
  },
  metaCard: {
    flexGrow: 1,
    padding: 10,
    borderWidth: 0.7,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 5,
  },
  metaLabel: { color: colors.inkFaint, fontSize: 7.7, fontWeight: 600 },
  metaValue: { marginTop: 3, fontSize: 9.2, fontWeight: 600 },
  resultPanel: {
    marginTop: 24,
    padding: 21,
    borderWidth: 0.8,
    borderColor: colors.sageLight,
    backgroundColor: colors.surface,
    borderRadius: 8,
  },
  resultRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 14 },
  resultIcon: {
    display: "flex",
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
    borderWidth: 0.8,
    borderColor: colors.sageLight,
    borderRadius: 24,
  },
  resultWave: { color: colors.sage, fontSize: 19, fontWeight: 700, letterSpacing: 1.6 },
  resultLabel: { color: colors.tealSoft, fontSize: 8.2, fontWeight: 700 },
  resultTitle: { marginTop: 2, color: "#365f3d", fontSize: 22, fontWeight: 700 },
  resultSummary: { marginTop: 14, color: colors.inkSoft, fontSize: 10.2, lineHeight: 1.5 },
  spectrum: { marginTop: 18 },
  spectrumLabels: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 3,
    color: colors.inkSoft,
    fontSize: 7.5,
  },
  nextStep: {
    display: "flex",
    flexDirection: "row",
    gap: 12,
    marginTop: 18,
    padding: 14,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 6,
  },
  nextStepIcon: {
    display: "flex",
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0.8,
    borderColor: colors.sage,
    borderRadius: 14,
  },
  nextStepMark: { color: colors.teal, fontSize: 13, fontWeight: 700 },
  cardTitle: { fontSize: 10.5, fontWeight: 700 },
  cardBody: { marginTop: 3, color: colors.inkSoft, fontSize: 9.1 },
  disclaimer: {
    display: "flex",
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
    padding: 12,
    borderWidth: 0.8,
    borderColor: colors.border,
    borderRadius: 6,
  },
  shield: { color: colors.teal, fontSize: 12, fontWeight: 700 },
  disclaimerText: { flex: 1, fontSize: 8.6 },
  sectionTitle: { marginTop: 6, fontSize: 24, fontWeight: 700, lineHeight: 1.05 },
  sectionIntro: { width: "84%", marginTop: 8, color: colors.inkSoft, fontSize: 10 },
  observations: { marginTop: 20, borderTopWidth: 0.8, borderTopColor: colors.border },
  observation: {
    display: "flex",
    flexDirection: "row",
    gap: 12,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 0.8,
    borderBottomColor: colors.border,
  },
  observationMark: {
    width: 25,
    height: 25,
    marginTop: 1,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 0.8,
    borderColor: colors.sageLight,
    borderRadius: 13,
  },
  observationBody: { flex: 1 },
  observationHeading: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 18,
  },
  observationTitle: { fontSize: 10.2, fontWeight: 700 },
  observationValue: { color: colors.tealSoft, fontSize: 8.7, fontWeight: 700 },
  observationCopy: { marginTop: 3, color: colors.inkSoft, fontSize: 8.6 },
  subsection: { marginTop: 22 },
  subsectionTitle: { fontSize: 12.2, fontWeight: 700 },
  subsectionBody: { marginTop: 3, color: colors.inkSoft, fontSize: 8.8 },
  singleSession: {
    marginTop: 11,
    padding: 13,
    borderWidth: 0.8,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 6,
  },
  historyLabels: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 1,
    color: colors.inkFaint,
    fontSize: 7.1,
  },
  historyLabelItem: { flex: 1 },
  historyBand: { marginTop: 2, color: colors.ink, fontSize: 7.3, fontWeight: 600 },
  columns: { display: "flex", flexDirection: "row", gap: 22, marginTop: 20 },
  column: { flex: 1 },
  evidenceBox: {
    marginTop: 14,
    padding: 12,
    borderWidth: 0.8,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 6,
  },
  evidenceRow: {
    display: "flex",
    flexDirection: "column",
    marginTop: 10,
  },
  evidenceMetric: {
    display: "flex",
    width: "100%",
    minHeight: 22,
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 4,
    paddingRight: 7,
    paddingBottom: 4,
    paddingLeft: 7,
    borderBottomWidth: 0.7,
    borderBottomColor: colors.border,
  },
  evidenceLabel: { width: "48%", color: colors.inkSoft, fontSize: 7.4 },
  evidenceValue: { width: "18%", color: colors.teal, fontSize: 11, fontWeight: 700 },
  evidenceDetail: { width: "34%", color: colors.inkFaint, fontSize: 6.8 },
  unavailableEvidence: {
    marginTop: 10,
    padding: 10,
    color: colors.inkSoft,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 4,
  },
  bullets: { marginTop: 8 },
  bullet: { display: "flex", flexDirection: "row", gap: 7, marginTop: 5 },
  bulletMark: { color: colors.tealSoft, fontSize: 8.5 },
  bulletText: { flex: 1, color: colors.inkSoft, fontSize: 8.7 },
  technical: {
    marginTop: 12,
    padding: 10,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 5,
  },
  technicalRow: { display: "flex", flexDirection: "row", marginTop: 2 },
  technicalLabel: { width: 104, color: colors.inkFaint, fontSize: 7.3 },
  technicalValue: { flex: 1, fontSize: 7.5 },
  footer: {
    position: "absolute",
    right: 46,
    bottom: 22,
    left: 46,
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    color: colors.inkFaint,
    fontSize: 7.2,
  },
});

function PageHeader({ model, page }: { model: ClinicianReportModel; page: number }) {
  return (
    <View style={styles.pageHeader}>
      <Text style={styles.brand}>SoundCue</Text>
      <Text style={styles.headerMeta}>{model.reportKind === "trend" ? "Clinician trend report" : "Clinician summary"}  |  {model.reportId}</Text>
      <Text style={styles.headerMeta}>{page} / 3</Text>
    </View>
  );
}

function PageFooter({ model }: { model: ClinicianReportModel }) {
  return (
    <View style={styles.footer}>
      <Text>Parkinson&apos;s voice screening aid - not a diagnosis</Text>
      <Text>Generated {model.generatedAt}</Text>
    </View>
  );
}

function ResultSpectrum({ position }: { position: number }) {
  const x = 36 + (position / 100) * 448;
  return (
    <View style={styles.spectrum}>
      <Svg width="520" height="32" viewBox="0 0 520 32">
        <Rect x="36" y="7" width="150" height="8" rx="4" fill={colors.fewer} />
        <Rect x="184" y="7" width="150" height="8" fill={colors.some} />
        <Rect x="332" y="7" width="152" height="8" rx="4" fill={colors.more} />
        <Circle cx={x} cy="11" r="9" fill={colors.surface} stroke={colors.teal} strokeWidth="4" />
        <Line x1={x} y1="20" x2={x} y2="27" stroke={colors.teal} strokeWidth="1" />
      </Svg>
      <View style={styles.spectrumLabels}>
        <Text>Fewer patterns</Text><Text>Some patterns</Text><Text>More patterns</Text>
      </View>
    </View>
  );
}

function historyPoint(point: ReportHistoryPoint, index: number, total: number) {
  const x = total === 1 ? 260 : 34 + (index * 452) / (total - 1);
  const y = point.band === "fewer" ? 104 : point.band === "some" ? 63 : 22;
  return { x, y };
}

function HistoryChart({ history }: { history: ReportHistoryPoint[] }) {
  if (history.length <= 1) {
    return (
      <View style={styles.singleSession}>
        <Text style={styles.cardTitle}>One comparable session</Text>
        <Text style={styles.cardBody}>A trend needs at least two screenings analyzed with the same research-model policy.</Text>
      </View>
    );
  }
  const points = history.map((point, index) => historyPoint(point, index, history.length));
  return (
    <View style={{ marginTop: 10 }}>
      <Svg width="520" height="120" viewBox="0 0 520 120">
        <Line x1="34" y1="22" x2="486" y2="22" stroke={colors.border} strokeWidth="1" />
        <Line x1="34" y1="63" x2="486" y2="63" stroke={colors.border} strokeWidth="1" />
        <Line x1="34" y1="104" x2="486" y2="104" stroke={colors.border} strokeWidth="1" />
        <Polyline points={points.map(({ x, y }) => `${x},${y}`).join(" ")} fill="none" stroke={colors.tealSoft} strokeWidth="2.5" />
        {points.map(({ x, y }, index) => (
          <Circle key={history[index].id} cx={x} cy={y} r="5.5" fill={colors.surface} stroke={colors.teal} strokeWidth="3" />
        ))}
      </Svg>
      <View style={styles.historyLabels}>
        {history.map((point) => (
          <View style={styles.historyLabelItem} key={point.id}>
            <Text>{point.label}</Text>
            <Text style={styles.historyBand}>{point.band[0].toUpperCase() + point.band.slice(1)} patterns</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ObservationMark() {
  return (
    <Svg width="25" height="25" viewBox="0 0 25 25">
      <Circle cx="12.5" cy="12.5" r="12" fill={colors.surfaceMuted} stroke={colors.sageLight} strokeWidth="0.8" />
      <Line x1="8" y1="9" x2="8" y2="16" stroke={colors.sage} strokeWidth="1.2" />
      <Line x1="12.5" y1="6.5" x2="12.5" y2="18.5" stroke={colors.sage} strokeWidth="1.2" />
      <Line x1="17" y1="9" x2="17" y2="16" stroke={colors.sage} strokeWidth="1.2" />
    </Svg>
  );
}

function Evidence({ model }: { model: ClinicianReportModel }) {
  return (
    <View style={styles.evidenceBox}>
      <Text style={styles.cardTitle}>Preliminary internal development evidence</Text>
      {model.evidence.participants ? <Text style={styles.cardBody}>Development cohort: {model.evidence.participants} participants.</Text> : null}
      {model.evidence.metrics.length ? (
        <View style={styles.evidenceRow}>
          {model.evidence.metrics.map((metric) => (
            <View style={styles.evidenceMetric} key={metric.label}>
              <Text style={styles.evidenceLabel}>{metric.label}</Text>
              <Text style={styles.evidenceValue}>{metric.value}</Text>
              {metric.detail ? <Text style={styles.evidenceDetail}>{metric.detail}</Text> : null}
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.unavailableEvidence}>Version-matched development metrics are not available in this report.</Text>
      )}
      <Text style={[styles.cardBody, { marginTop: 9 }]}>These figures describe internal model development, not performance in independent clinical use.</Text>
    </View>
  );
}

export function ClinicianReportDocument({ model }: { model: ClinicianReportModel }) {
  const isTrendReport = model.reportKind === "trend";

  return (
    <Document
      title={`SoundCue Parkinson's voice screening ${isTrendReport ? "trend report" : "clinician summary"} ${model.reportId}`}
      author="SoundCue"
      subject={`Patient-generated Parkinson's voice screening ${isTrendReport ? "trend report" : "summary"}`}
      keywords="SoundCue, Parkinson's disease, voice screening, clinician report, screening trend"
      creator="SoundCue"
      producer="SoundCue"
      language="en-US"
    >
      <Page size="LETTER" style={styles.page}>
        <PageHeader model={model} page={1} />
        <View style={[styles.titleBlock, { marginTop: 16 }]}> 
          <Text style={styles.sectionLabel}>{isTrendReport ? "Parkinson's voice screening trend" : "Parkinson's voice screening result"}</Text>
          <Text style={[styles.title, { fontSize: 25 }]}>{isTrendReport ? "Parkinson's voice screening trend report" : "Parkinson's voice screening clinician summary"}</Text>
          <Text style={styles.subtitle}>{isTrendReport ? `A patient-generated report of ${model.sessionCount} comparable ${model.sessionCount === 1 ? "screening" : "screenings"} to support a conversation with a healthcare professional.` : "A patient-generated screening summary to support a conversation with a healthcare professional."}</Text>
        </View>
        <View style={[styles.metaGrid, { marginTop: 16 }]}>
          <View style={styles.metaCard}><Text style={styles.metaLabel}>Report ID</Text><Text style={styles.metaValue}>{model.reportId}</Text></View>
          <View style={styles.metaCard}><Text style={styles.metaLabel}>{isTrendReport ? "Latest recording" : "Recorded"}</Text><Text style={styles.metaValue}>{model.recordedAt}</Text></View>
          <View style={styles.metaCard}><Text style={styles.metaLabel}>Age entered</Text><Text style={styles.metaValue}>{model.ageYears ?? "Not collected"}</Text></View>
          <View style={styles.metaCard}><Text style={styles.metaLabel}>{isTrendReport ? "Comparable sessions" : "Model"}</Text><Text style={styles.metaValue}>{isTrendReport ? model.sessionCount : model.modelVersion}</Text></View>
        </View>
        <View style={[styles.resultPanel, { marginTop: 18, padding: 18 }]}>
          <View style={styles.resultRow}>
            <View style={styles.resultIcon}><Text style={styles.resultWave}>|||</Text></View>
            <View><Text style={styles.resultLabel}>{isTrendReport ? "LATEST COMPARABLE RESULT" : "SCREENING RESULT"}</Text><Text style={styles.resultTitle}>{model.bandLabel}</Text></View>
          </View>
          <Text style={styles.resultSummary}>{model.bandSummary}</Text>
          <ResultSpectrum position={model.spectrumPosition} />
          <View style={styles.nextStep}>
            <View style={styles.nextStepIcon}><Text style={styles.nextStepMark}>+</Text></View>
            <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{model.recommendationTitle}</Text><Text style={styles.cardBody}>{model.recommendation}</Text></View>
          </View>
        </View>
        <View style={[styles.metaGrid, { marginTop: 16 }]}>
          <View style={styles.metaCard}><Text style={styles.metaLabel}>Recording duration</Text><Text style={styles.metaValue}>{model.duration}</Text></View>
          <View style={styles.metaCard}><Text style={styles.metaLabel}>Analysis completed</Text><Text style={styles.metaValue}>{model.completedAt}</Text></View>
          <View style={styles.metaCard}><Text style={styles.metaLabel}>Recording retained</Text><Text style={styles.metaValue}>{model.hasRecording ? "Yes - authenticated account" : "No recording available"}</Text></View>
        </View>
        <View style={[styles.disclaimer, { marginTop: 12, padding: 10 }]}>
          <Text style={styles.shield}>i</Text>
          <Text style={styles.disclaimerText}>{model.disclaimer}</Text>
        </View>
        <PageFooter model={model} />
      </Page>

      <Page size="LETTER" style={styles.page}>
        <PageHeader model={model} page={2} />
        <View style={styles.titleBlock}>
          <Text style={styles.sectionLabel}>{isTrendReport ? "Comparable history" : "Recording context"}</Text>
          <Text style={styles.sectionTitle}>{isTrendReport ? "Parkinson's voice screening trend" : "What SoundCue noticed"}</Text>
          <Text style={styles.sectionIntro}>{isTrendReport ? "Only research sessions using the same category policy are shown together. Categories are descriptive screening ranges, not probabilities of Parkinson's disease." : "These observations describe this voice sample. They are not causal explanations of the embedding-based research model."}</Text>
        </View>
        {isTrendReport ? (
          <View style={[styles.subsection, { marginTop: 10 }]}>
            <HistoryChart history={model.history} />
            <Text style={[styles.subsectionTitle, { marginTop: 14 }]}>Latest recording context</Text>
            <Text style={styles.subsectionBody}>These observations describe the latest voice sample in the trend. They do not explain why the research model assigned its category.</Text>
          </View>
        ) : null}
        <View style={styles.observations}>
          {model.observations.map((observation) => (
            <View style={styles.observation} key={`${observation.code}-${observation.title}`} wrap={false}>
              <View style={styles.observationMark}><ObservationMark /></View>
              <View style={styles.observationBody}>
                <View style={styles.observationHeading}><Text style={styles.observationTitle}>{observation.title}</Text><Text style={styles.observationValue}>{observation.value}</Text></View>
                <Text style={styles.observationCopy}>{observation.description}</Text>
              </View>
            </View>
          ))}
        </View>
        {isTrendReport ? null : (
          <View style={styles.subsection}>
            <Text style={styles.subsectionTitle}>Comparable Parkinson&apos;s voice screening history</Text>
            <Text style={styles.subsectionBody}>Only research sessions using the same category policy are shown together. Categories are screening ranges, not probabilities of Parkinson&apos;s disease.</Text>
            <HistoryChart history={model.history} />
          </View>
        )}
        <View style={styles.disclaimer}>
          <Text style={styles.shield}>i</Text>
          <Text style={styles.disclaimerText}>{model.hasRecording ? "The latest recording remains in the user’s authenticated SoundCue account." : "No recording is available for the latest session."}</Text>
        </View>
        <PageFooter model={model} />
      </Page>

      <Page size="LETTER" style={styles.page}>
        <PageHeader model={model} page={3} />
        <View style={styles.titleBlock}>
          <Text style={styles.sectionLabel}>Clinical review</Text>
          <Text style={styles.sectionTitle}>How to read this summary</Text>
        </View>
        <View style={[styles.columns, { marginTop: 16 }]}>
          <View style={styles.column}><Text style={styles.cardTitle}>How the analysis works</Text><Text style={styles.cardBody}>{model.howItWorks}</Text></View>
          <View style={styles.column}>
            <Text style={styles.cardTitle}>Important limitations</Text>
            <Text style={styles.cardBody}>{model.evidenceLimitations}</Text>
            {model.evidence.limitations.slice(0, 2).map((limitation) => (
              <View style={styles.bullet} key={limitation}><Text style={styles.bulletMark}>-</Text><Text style={styles.bulletText}>{limitation}</Text></View>
            ))}
          </View>
        </View>
        <Evidence model={model} />
        <View style={[styles.subsection, { marginTop: 14 }]}>
          <Text style={styles.subsectionTitle}>Questions to consider with a clinician</Text>
          <View style={[styles.bullets, { marginTop: 5 }]}>
            {model.clinicianQuestions.map((question) => (
              <View style={[styles.bullet, { marginTop: 3 }]} key={question}><Text style={styles.bulletMark}>-</Text><Text style={styles.bulletText}>{question}</Text></View>
            ))}
          </View>
        </View>
        <View style={styles.technical}>
          <Text style={styles.cardTitle}>Analysis provenance</Text>
          <View style={styles.technicalRow}><Text style={styles.technicalLabel}>Model version</Text><Text style={styles.technicalValue}>{model.modelVersion}</Text></View>
          <View style={styles.technicalRow}><Text style={styles.technicalLabel}>Preprocessing</Text><Text style={styles.technicalValue}>{model.preprocessingVersion}</Text></View>
          <View style={styles.technicalRow}><Text style={styles.technicalLabel}>Category policy</Text><Text style={styles.technicalValue}>{model.bandPolicyVersion}</Text></View>
          <View style={styles.technicalRow}><Text style={styles.technicalLabel}>Artifact SHA-256</Text><Text style={styles.technicalValue}>{model.artifactHash}</Text></View>
          <View style={styles.technicalRow}><Text style={styles.technicalLabel}>Report generated</Text><Text style={styles.technicalValue}>{model.generatedAt}</Text></View>
        </View>
        <PageFooter model={model} />
      </Page>
    </Document>
  );
}

export async function renderClinicianReportPdf(model: ClinicianReportModel): Promise<Buffer> {
  return renderToBuffer(<ClinicianReportDocument model={model} />);
}
