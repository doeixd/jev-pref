from manim import *

# Render with:
#   manim -qh jev_pref_explainer.py JevPrefExplainer
# (-p preview omitted for headless runs; add -p to preview locally.)
# For 1080p60:
#   manim -qh --fps 60 jev_pref_explainer.py JevPrefExplainer

config.background_color = BLACK
config.frame_width = 16
config.frame_height = 9
config.pixel_width = 1920
config.pixel_height = 1080
config.frame_rate = 30

WHITE_90 = "#EDEDED"
WHITE_70 = "#BDBDBD"
WHITE_45 = "#777777"
WHITE_25 = "#444444"


class JevPrefExplainer(Scene):
    def construct(self):
        self.camera.background_color = BLACK
        self.title_scene()
        self.tooling_gap_scene()
        self.preference_scene()
        self.diff_scene()
        self.verdict_scene()
        self.agent_loop_scene()
        self.final_scene()

    # ---------- helpers ----------
    def t(self, text, size=42, color=WHITE_90, weight=NORMAL, font="Segoe UI", **kwargs):
        return Text(text, font=font, font_size=size, color=color, weight=weight, **kwargs)

    def mono(self, text, size=31, color=WHITE_90, **kwargs):
        return Text(text, font="Cascadia Mono", font_size=size, color=color, **kwargs)

    def box(self, width, height, stroke=WHITE_45, fill=BLACK, radius=0.18, stroke_width=2):
        return RoundedRectangle(
            width=width,
            height=height,
            corner_radius=radius,
            stroke_color=stroke,
            stroke_width=stroke_width,
            fill_color=fill,
            fill_opacity=1,
        )

    def label_box(self, title, subtitle=None, width=4.2, height=1.35, title_size=34):
        rect = self.box(width, height)
        title_m = self.t(title, title_size, weight=BOLD)
        if subtitle:
            sub_m = self.t(subtitle, 22, color=WHITE_70)
            group = VGroup(title_m, sub_m).arrange(DOWN, buff=0.12)
        else:
            group = VGroup(title_m)
        group.move_to(rect.get_center())
        return VGroup(rect, group)

    def section_label(self, text):
        label = self.t(text.upper(), 20, color=WHITE_45, weight=BOLD)
        label.to_edge(UP, buff=0.35).to_edge(LEFT, buff=0.55)
        return label

    def wipe(self, *mobjects, run_time=0.45):
        mobs = [m for m in mobjects if m is not None]
        if mobs:
            self.play(*[FadeOut(m, shift=0.08 * UP) for m in mobjects if m is not None], run_time=run_time)

    def threshold_bar(self, p, width=4.4, height=0.42):
        """Bernoulli visualization: estimated P against the 0.70 gate."""
        track = self.box(width, height, stroke=WHITE_45, radius=0.08)
        fill = Rectangle(
            width=width * p, height=height, color=WHITE_90,
            fill_opacity=0.85, stroke_width=0,
        )
        fill.move_to(track.get_center()).align_to(track, LEFT)
        gate_x = track.get_left()[0] + width * 0.70
        gate = Line(
            start=[gate_x, track.get_top()[1] - 0.12, 0],
            end=[gate_x, track.get_bottom()[1] + 0.12, 0],
            color=WHITE_90, stroke_width=5,
        )
        gate_label = self.t("0.70", 20, color=WHITE_70)
        gate_label.next_to(gate, DOWN, buff=0.2)
        return VGroup(track, fill, gate, gate_label)

    # ---------- scenes ----------
    def title_scene(self):
        mark = self.box(1.15, 1.15, stroke=WHITE_90, radius=0.22, stroke_width=3)
        j = self.t("J", 56, weight=BOLD).move_to(mark)
        logo = VGroup(mark, j)

        title = self.t("jev-pref", 78, weight=BOLD)
        subtitle = self.t("A semantic linter for coding agents", 34, color=WHITE_70)
        stack = VGroup(logo, title, subtitle).arrange(DOWN, buff=0.3)
        stack.move_to(ORIGIN)

        self.play(DrawBorderThenFill(mark), FadeIn(j), run_time=0.8)
        self.play(Write(title), run_time=0.75)
        self.play(FadeIn(subtitle, shift=0.12 * UP), run_time=0.65)
        self.wait(1.25)

        thesis = self.t(
            "Make project-specific engineering judgment executable.",
            30,
            color=WHITE_90,
        ).next_to(stack, DOWN, buff=0.65)
        self.play(FadeIn(thesis), run_time=0.6)
        self.wait(1.6)
        self.wipe(stack, thesis)

    def tooling_gap_scene(self):
        section = self.section_label("The missing layer")
        self.play(FadeIn(section))

        tools = [
            ("TypeScript", "type invariants"),
            ("ESLint", "syntax + static rules"),
            ("tests", "behavioral invariants"),
        ]
        rows = VGroup()
        for name, desc in tools:
            left = self.mono(name, 30, color=WHITE_90)
            arrow = self.t("→", 30, color=WHITE_45)
            right = self.t(desc, 28, color=WHITE_70)
            row = VGroup(left, arrow, right).arrange(RIGHT, buff=0.35)
            rows.add(row)
        rows.arrange(DOWN, buff=0.4, aligned_edge=LEFT)
        rows.move_to(UP * 0.8)
        rows.shift(LEFT * 1.2)

        for row in rows:
            self.play(FadeIn(row, shift=0.18 * RIGHT), run_time=0.42)

        gap_line = Line(LEFT * 5.5, RIGHT * 5.5, color=WHITE_25, stroke_width=2)
        gap_line.next_to(rows, DOWN, buff=0.6)
        question = self.t("But what enforces project-specific semantic rules?", 33, weight=BOLD)
        question.next_to(gap_line, DOWN, buff=0.5)
        self.play(Create(gap_line), FadeIn(question, shift=0.1 * UP))
        self.wait(1.1)

        jev_row = VGroup(
            self.mono("jev-pref", 31, color=WHITE_90),
            self.t("→", 30, color=WHITE_45),
            self.t("semantic project invariants", 30, color=WHITE_90, weight=BOLD),
        ).arrange(RIGHT, buff=0.35)
        jev_row.next_to(question, DOWN, buff=0.65)
        highlight = self.box(8.6, 1.0, stroke=WHITE_90, radius=0.18, stroke_width=2)
        highlight.move_to(jev_row)

        self.play(DrawBorderThenFill(highlight), FadeIn(jev_row), run_time=0.8)
        self.wait(1.6)
        self.wipe(section, rows, gap_line, question, highlight, jev_row)

    def preference_scene(self):
        section = self.section_label("From guidance to a check")
        self.play(FadeIn(section))

        guidance_title = self.t("Project guidance", 24, color=WHITE_45, weight=BOLD)
        guidance_title.move_to(UP * 2.85 + LEFT * 3.9)
        guidance_box = self.box(6.6, 2.25, stroke=WHITE_45)
        guidance_box.move_to(LEFT * 3.9 + UP * 1.25)
        guidance_text = self.t(
            '"Public primitives should compose with\nexisting primitives rather than introduce\nparallel systems."',
            27,
            color=WHITE_90,
            line_spacing=0.85,
        )
        guidance_text.move_to(guidance_box)

        agent = self.label_box("coding agent", "shapes the intent", width=3.0, height=1.35, title_size=31)
        agent.move_to(ORIGIN + RIGHT * 0.15)

        check_title = self.t("Concrete Jev check", 24, color=WHITE_45, weight=BOLD)
        check_title.move_to(UP * 2.85 + RIGHT * 4.05)
        check_box = self.box(6.7, 2.55, stroke=WHITE_90)
        check_box.move_to(RIGHT * 4.0 + UP * 1.25)
        check_text = self.t(
            "Does this diff introduce another representation\nof a concept already represented by the\nproject's Surface abstraction?",
            25,
            color=WHITE_90,
            line_spacing=0.82,
        )
        check_text.move_to(check_box)

        a1 = Arrow(guidance_box.get_right(), agent.get_left(), buff=0.2, color=WHITE_45)
        a2 = Arrow(agent.get_right(), check_box.get_left(), buff=0.2, color=WHITE_45)

        self.play(FadeIn(guidance_title), Create(guidance_box), FadeIn(guidance_text), run_time=0.7)
        self.play(GrowArrow(a1), FadeIn(agent), run_time=0.65)
        self.play(GrowArrow(a2), FadeIn(check_title), Create(check_box), FadeIn(check_text), run_time=0.85)

        footer = self.t("You define what counts. Jev only evaluates the evidence.", 31, weight=BOLD)
        footer.to_edge(DOWN, buff=0.7)
        self.play(FadeIn(footer, shift=0.12 * UP))
        self.wait(2.0)
        self.wipe(section, guidance_title, guidance_box, guidance_text, agent, check_title, check_box, check_text, a1, a2, footer)

    def diff_scene(self):
        section = self.section_label("Review the change")
        self.play(FadeIn(section))

        cmd = self.mono("$ npx jev-pref review --hunks", 33)
        cmd.to_edge(UP, buff=1.0).to_edge(LEFT, buff=1.0)
        self.play(Write(cmd), run_time=0.7)

        diff_box = self.box(12.8, 4.8, stroke=WHITE_45, radius=0.15)
        diff_box.move_to(DOWN * 0.25)

        diff_lines = [
            ("@@ packages/transports/src/index.ts @@", WHITE_45),
            ("  export { Transport } from './transport'", WHITE_70),
            ("+ export interface TransportSurface {", WHITE_90),
            ("+   send(input: Request): Effect<Response>", WHITE_90),
            ("+ }", WHITE_90),
            ("", WHITE_70),
            ("  // existing Surface already models this boundary", WHITE_45),
        ]
        lines = VGroup(*[self.mono(s, 26, color=c) for s, c in diff_lines])
        lines.arrange(DOWN, buff=0.18, aligned_edge=LEFT)
        lines.move_to(diff_box.get_center()).align_to(diff_box, LEFT).shift(RIGHT * 0.5)

        self.play(Create(diff_box), FadeIn(lines, lag_ratio=0.06), run_time=1.0)
        self.wait(1.4)

        lens = self.box(5.4, 1.1, stroke=WHITE_90, radius=0.12, stroke_width=2)
        lens.move_to(lines[2:5].get_center())
        lens.align_to(lines[2], LEFT).shift(RIGHT * 2.4)
        label = self.t("visible evidence", 22, color=WHITE_90, weight=BOLD)
        label.next_to(lens, RIGHT, buff=0.3)
        self.play(Create(lens), FadeIn(label))
        self.wait(1.2)
        self.wipe(section, cmd, diff_box, lines, lens, label)

    def verdict_scene(self):
        section = self.section_label("Jev classifies; jev-pref applies policy")
        self.play(FadeIn(section))

        jev = self.label_box("Jev", "bounded classifier", width=3.0, height=1.45, title_size=39)
        jev.move_to(LEFT * 4.8 + UP * 0.8)
        policy = self.label_box("jev-pref", "threshold + outcome", width=3.4, height=1.45, title_size=37)
        policy.move_to(ORIGIN + UP * 0.8)
        agent = self.label_box("coding agent", "acts on finding", width=3.4, height=1.45, title_size=32)
        agent.move_to(RIGHT * 4.8 + UP * 0.8)

        a1 = Arrow(jev.get_right(), policy.get_left(), buff=0.2, color=WHITE_45)
        a2 = Arrow(policy.get_right(), agent.get_left(), buff=0.2, color=WHITE_45)

        self.play(FadeIn(jev), GrowArrow(a1), FadeIn(policy), GrowArrow(a2), FadeIn(agent), run_time=1.0)

        classification = VGroup(
            self.mono("new_parallel_abstraction", 28, color=WHITE_90),
            self.mono("P = 0.91", 34, color=WHITE_90),
        ).arrange(DOWN, buff=0.25)
        classification.next_to(jev, DOWN, buff=0.7)
        self.play(FadeIn(classification, shift=0.1 * UP))

        # A condition is a Bernoulli estimate: P against the 0.70 gate.
        bar = self.threshold_bar(0.91)
        bar.next_to(classification, DOWN, buff=0.45)
        bernoulli = self.t("Bernoulli, not boolean", 21, color=WHITE_70, weight=BOLD)
        bernoulli.next_to(bar, DOWN, buff=0.42)
        self.play(Create(bar), FadeIn(bernoulli))
        self.wait(1.0)

        mapping = VGroup(
            self.t("threshold: 0.70", 25, color=WHITE_70),
            self.t("outcome: advisory", 30, weight=BOLD),
        ).arrange(DOWN, buff=0.2)
        mapping.next_to(policy, DOWN, buff=0.7)
        self.play(FadeIn(mapping, shift=0.1 * UP))

        # Fixed taxonomy from a real run: Jev picks the label (P = 1.00),
        # the config maps the consequence.
        taxonomy = VGroup(
            self.mono("docs   -> advisory", 24, color=WHITE_70),
            self.mono("config -> fix_now", 24, color=WHITE_90, weight=BOLD),
        ).arrange(DOWN, buff=0.18, aligned_edge=LEFT)
        taxonomy.next_to(mapping, DOWN, buff=0.5)
        tax_note = self.t("Jev picks the label; the config decides", 20, color=WHITE_45)
        tax_note.next_to(taxonomy, DOWN, buff=0.25)
        self.play(FadeIn(taxonomy, shift=0.1 * UP), FadeIn(tax_note))
        self.wait(1.0)

        finding_box = self.box(4.6, 2.3, stroke=WHITE_90, radius=0.16)
        finding_box.next_to(agent, DOWN, buff=0.55)
        finding = VGroup(
            self.t("ADVISORY", 25, weight=BOLD),
            self.t("TransportSurface duplicates", 24),
            self.t("the existing Surface concept.", 24),
        ).arrange(DOWN, buff=0.13)
        finding.move_to(finding_box)
        self.play(Create(finding_box), FadeIn(finding))
        self.wait(1.8)

        note = self.t("The model does not decide project policy. Your config does.", 29, color=WHITE_70)
        note.to_edge(DOWN, buff=0.45)
        self.play(FadeIn(note))
        self.wait(1.8)
        self.wipe(section, jev, policy, agent, a1, a2, classification, bar,
                  bernoulli, mapping, taxonomy, tax_note, finding_box, finding, note)

    def agent_loop_scene(self):
        section = self.section_label("The agent loop")
        self.play(FadeIn(section))

        positions = [LEFT * 5.4, LEFT * 1.8, RIGHT * 1.8, RIGHT * 5.4]
        labels = [
            ("implement", "code the change"),
            ("review", "jev-pref --hunks"),
            ("fix", "use the finding"),
            ("rerun", "verify the result"),
        ]
        boxes = VGroup(*[
            self.label_box(a, b, width=2.7, height=1.45, title_size=31).move_to(p)
            for p, (a, b) in zip(positions, labels)
        ])

        arrows = VGroup(*[
            Arrow(boxes[i].get_right(), boxes[i + 1].get_left(), buff=0.15, color=WHITE_45)
            for i in range(3)
        ])

        self.play(LaggedStart(*[FadeIn(b, shift=0.1 * UP) for b in boxes], lag_ratio=0.15), run_time=1.1)
        self.play(LaggedStart(*[GrowArrow(a) for a in arrows], lag_ratio=0.18), run_time=0.9)

        loop_arrow = CurvedArrow(
            boxes[-1].get_bottom() + DOWN * 0.2,
            boxes[1].get_bottom() + DOWN * 0.2,
            angle=-TAU / 4,
            color=WHITE_45,
            stroke_width=3,
        )
        loop_label = self.t("finding still fires", 23, color=WHITE_45)
        loop_label.next_to(loop_arrow, DOWN, buff=0.1)
        self.play(Create(loop_arrow), FadeIn(loop_label))
        self.wait(1.2)

        approve = self.box(3.9, 1.25, stroke=WHITE_90, radius=0.18, stroke_width=3)
        approve.move_to(RIGHT * 5.9 + DOWN * 2.62)
        approve_text = self.t("APPROVE", 35, weight=BOLD).move_to(approve)
        down = Arrow(boxes[-1].get_bottom(), approve.get_top(), buff=0.25, color=WHITE_90)
        self.play(GrowArrow(down), DrawBorderThenFill(approve), FadeIn(approve_text), run_time=0.8)

        caption = self.t("jev-pref is the linter. The coding agent is the fixer.", 31, weight=BOLD)
        caption.to_edge(DOWN, buff=0.35)
        self.play(FadeIn(caption))
        self.wait(2.0)
        self.wipe(section, boxes, arrows, loop_arrow, loop_label, down, approve, approve_text, caption)

    def final_scene(self):
        lines = VGroup(
            self.t("Define the semantic rules", 45, weight=BOLD),
            self.t("static tooling can't express.", 45, weight=BOLD),
        ).arrange(DOWN, buff=0.1)
        lines.move_to(UP * 1.2)

        self.play(FadeIn(lines, shift=0.2 * UP), run_time=0.8)
        self.wait(0.8)

        three = VGroup(
            self.t("YOU define the rule", 28, color=WHITE_70),
            self.t("JEV classifies the evidence", 28, color=WHITE_70),
            self.t("YOUR AGENT acts on the result", 28, color=WHITE_70),
        ).arrange(DOWN, buff=0.22)
        three.next_to(lines, DOWN, buff=0.75)
        self.play(LaggedStart(*[FadeIn(x, shift=0.08 * RIGHT) for x in three], lag_ratio=0.2), run_time=1.0)
        self.wait(1.1)

        cmd_box = self.box(6.6, 1.05, stroke=WHITE_90, radius=0.16, stroke_width=2)
        cmd_box.to_edge(DOWN, buff=0.7)
        cmd = self.mono("npx jev-pref setup", 34).move_to(cmd_box)
        self.play(Create(cmd_box), Write(cmd), run_time=0.8)
        self.wait(2.5)
