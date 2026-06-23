import json
import os
import shutil
import unittest

import finops_core as fc


class FinopsCoreTests(unittest.TestCase):
    def setUp(self):
        self.fixture_dir = os.path.join(os.getcwd(), "testdata")
        if os.path.exists(self.fixture_dir):
            shutil.rmtree(self.fixture_dir)
        os.makedirs(self.fixture_dir)

    def tearDown(self):
        if os.path.exists(self.fixture_dir):
            shutil.rmtree(self.fixture_dir)

    def test_find_logs_includes_process_session_uuid_and_github_patterns(self):
        sid = "11111111-1111-4111-8111-111111111111"
        names = [
            "process-1-2.log",
            f"session-{sid}.log",
            f"{sid}.log",
            "github-app.123.log",
        ]
        for name in names:
            with open(os.path.join(self.fixture_dir, name), "w", encoding="utf-8") as fh:
                fh.write(f"line for session {sid}\n")
        self.assertEqual(
            sorted(os.path.basename(p) for p in fc.find_logs(sid, self.fixture_dir)),
            sorted(names),
        )

    def test_parse_shutdown_metrics_prefers_model_token_details_and_costs(self):
        event = {
            "type": "session.shutdown",
            "timestamp": "2026-01-02T03:04:05.000Z",
            "data": {
                "sessionStartTime": 1767315840000,
                "totalPremiumRequests": 7.5,
                "modelMetrics": {
                    "claude-opus-4.7": {
                        "requests": {"count": 2, "cost": 7.5},
                        "usage": {
                            "inputTokens": 999,
                            "cacheReadTokens": 999,
                            "cacheWriteTokens": 999,
                            "outputTokens": 999,
                        },
                        "totalNanoAiu": 12_345_000_000,
                        "tokenDetails": {
                            "input": {"tokenCount": 10},
                            "cache_read": {"tokenCount": 20},
                            "cache_write": {"tokenCount": 30},
                            "output": {"tokenCount": 40},
                        },
                    }
                },
            },
        }
        parsed = fc.session_from_shutdown("abc", event)
        self.assertEqual(parsed["source"], "events_shutdown")
        self.assertEqual(parsed["premium_requests"], 7.5)
        self.assertEqual(parsed["models"][0]["tokens"], {"input": 10, "cache_read": 20, "cache_write": 30, "output": 40})
        expected_usd = 15 * (10 + 0.10 * 20 + 1.25 * 30) / 1_000_000 + 75 * 40 / 1_000_000
        self.assertAlmostEqual(parsed["usd"], expected_usd, places=12)
        self.assertEqual(parsed["nano_aiu"], 12_345_000_000)

    def test_parse_log_usage_derives_nano_aiu_and_usd(self):
        sid = "22222222-2222-4222-8222-222222222222"
        path = os.path.join(self.fixture_dir, "process-123.log")
        usage = {
            "token_details": [
                {"batch_size": 1_000_000, "cost_per_batch": 500_000_000_000, "token_count": 2, "token_type": "input"},
                {"batch_size": 1_000_000, "cost_per_batch": 50_000_000_000, "token_count": 3, "token_type": "cache_read"},
                {"batch_size": 1_000_000, "cost_per_batch": 625_000_000_000, "token_count": 4, "token_type": "cache_write"},
                {"batch_size": 1_000_000, "cost_per_batch": 2_500_000_000_000, "token_count": 5, "token_type": "output"},
            ],
            "total_nano_aiu": 2 * 500_000 + 3 * 50_000 + 4 * 625_000 + 5 * 2_500_000,
        }
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(f'{{"model":"claude-opus-4.8"}} for session {sid}\n  "copilot_usage": ')
            fh.write(json.dumps(usage, indent=2))
            fh.write("\n")
        records = fc.parse_copilot_usage_log(path, sid)
        parsed = fc.session_from_log_records(sid, records, [path])
        self.assertEqual(parsed["tokens"], {"input": 2, "cache_read": 3, "cache_write": 4, "output": 5})
        self.assertEqual(parsed["nano_aiu"], usage["total_nano_aiu"])
        self.assertAlmostEqual(parsed["usd"], 15 * (2 + 0.1 * 3 + 1.25 * 4) / 1_000_000 + 75 * 5 / 1_000_000)

    def test_attribute_session_cost_to_invocations_proportionally(self):
        session = {"tokens": {"input": 10, "cache_read": 20, "cache_write": 30, "output": 40}, "usd": 2.0, "credits": 200.0}
        result = fc.attribute_to_invocations(session, {"bash": 3, "skill:pdf": 1})
        self.assertEqual(result["bash"]["count"], 3)
        self.assertEqual(result["skill:pdf"]["count"], 1)
        self.assertAlmostEqual(result["bash"]["usd"], 1.5)
        self.assertAlmostEqual(result["skill:pdf"]["tokens_total"], 25.0)

    def test_skill_windows_are_non_overlapping_and_leave_prefix_unattributed(self):
        events = [
            {"type": "user.message", "timestamp": "2026-01-01T00:00:00.000Z", "data": {}},
            {"type": "assistant.message", "timestamp": "2026-01-01T00:00:01.000Z", "data": {"model": "claude-opus-4.8", "outputTokens": 11}},
            {"type": "skill.invoked", "timestamp": "2026-01-01T00:00:02.000Z", "data": {"name": "pdf"}},
            {"type": "assistant.message", "timestamp": "2026-01-01T00:00:03.000Z", "data": {"model": "claude-opus-4.8", "outputTokens": 7}},
            {"type": "assistant.message", "timestamp": "2026-01-01T00:00:04.000Z", "data": {"model": "claude-opus-4.8", "outputTokens": 3}},
            {"type": "skill.invoked", "timestamp": "2026-01-01T00:00:05.000Z", "data": {"name": "workiq"}},
            {"type": "assistant.message", "timestamp": "2026-01-01T00:00:06.000Z", "data": {"model": "claude-opus-4.8", "outputTokens": 5}},
            {"type": "user.message", "timestamp": "2026-01-01T00:00:07.000Z", "data": {}},
            {"type": "assistant.message", "timestamp": "2026-01-01T00:00:08.000Z", "data": {"model": "claude-opus-4.8", "outputTokens": 13}},
        ]
        session = {
            "models": [
                {
                    "model": "claude-opus-4.8",
                    "tokens": {"input": 0, "cache_read": 0, "cache_write": 0, "output": 20},
                    "usd": 2.0,
                    "credits": 200.0,
                }
            ]
        }

        windows = fc.compute_skill_windows(events, session)

        self.assertEqual(
            [(w["skill_name"], w["window_start_time"], w["window_end_time"], w["model"], w["window_output_tokens"]) for w in windows],
            [
                ("pdf", "2026-01-01T00:00:02.000Z", "2026-01-01T00:00:05.000Z", "claude-opus-4-8", 10),
                ("workiq", "2026-01-01T00:00:05.000Z", "2026-01-01T00:00:07.000Z", "claude-opus-4-8", 5),
            ],
        )
        self.assertAlmostEqual(windows[0]["window_usd_est"], 1.0)
        self.assertAlmostEqual(windows[1]["window_usd_est"], 0.5)

    def test_skill_windows_apportion_each_model_from_metered_model_pool(self):
        events = [
            {"type": "skill.invoked", "timestamp": "2026-01-01T00:00:00.000Z", "data": {"name": "azure-pricing"}},
            {"type": "assistant.message", "timestamp": "2026-01-01T00:00:01.000Z", "data": {"model": "claude-opus-4.8", "outputTokens": 40}},
            {"type": "assistant.message", "timestamp": "2026-01-01T00:00:02.000Z", "data": {"model": "claude-sonnet-4.6", "outputTokens": 60}},
            {"type": "user.message", "timestamp": "2026-01-01T00:00:03.000Z", "data": {}},
        ]
        session = {
            "models": [
                {
                    "model": "claude-opus-4.8",
                    "tokens": {"input": 0, "cache_read": 0, "cache_write": 0, "output": 80},
                    "usd": 8.0,
                    "credits": 800.0,
                },
                {
                    "model": "claude-sonnet-4.6",
                    "tokens": {"input": 0, "cache_read": 0, "cache_write": 0, "output": 120},
                    "usd": 12.0,
                    "credits": 1200.0,
                },
            ]
        }

        windows = fc.compute_skill_windows(events, session)

        by_model = {w["model"]: w for w in windows}
        self.assertEqual(by_model["claude-opus-4-8"]["window_output_tokens"], 40)
        self.assertEqual(by_model["claude-opus-4-8"]["denominator_output_tokens"], 80)
        self.assertAlmostEqual(by_model["claude-opus-4-8"]["window_usd_est"], 4.0)
        self.assertEqual(by_model["claude-sonnet-4-6"]["window_output_tokens"], 60)
        self.assertEqual(by_model["claude-sonnet-4-6"]["denominator_output_tokens"], 120)
        self.assertAlmostEqual(by_model["claude-sonnet-4-6"]["window_usd_est"], 6.0)

    def test_skill_window_usd_is_not_modeled_when_measured_output_exceeds_metered_pool(self):
        events = [
            {"type": "skill.invoked", "timestamp": "2026-01-01T00:00:00.000Z", "data": {"name": "workiq"}},
            {"type": "assistant.message", "timestamp": "2026-01-01T00:00:01.000Z", "data": {"model": "claude-opus-4.8", "outputTokens": 15}},
            {"type": "user.message", "timestamp": "2026-01-01T00:00:02.000Z", "data": {}},
        ]
        session = {
            "models": [
                {
                    "model": "claude-opus-4.8",
                    "tokens": {"input": 0, "cache_read": 0, "cache_write": 0, "output": 10},
                    "usd": 1.0,
                    "credits": 100.0,
                }
            ]
        }

        windows = fc.compute_skill_windows(events, session)

        self.assertEqual(windows[0]["window_output_tokens"], 15)
        self.assertEqual(windows[0]["denominator_output_tokens"], 10)
        self.assertAlmostEqual(windows[0]["window_usd_est"], 0.0)

    def test_skill_window_uses_sole_session_model_when_message_model_is_missing(self):
        events = [
            {"type": "skill.invoked", "timestamp": "2026-01-01T00:00:00.000Z", "data": {"name": "apm-review-panel"}},
            {"type": "assistant.message", "timestamp": "2026-01-01T00:00:01.000Z", "data": {"outputTokens": 25}},
            {"type": "user.message", "timestamp": "2026-01-01T00:00:02.000Z", "data": {}},
        ]
        session = {
            "models": [
                {
                    "model": "claude-opus-4.7",
                    "tokens": {"input": 0, "cache_read": 0, "cache_write": 0, "output": 100},
                    "usd": 4.0,
                    "credits": 400.0,
                }
            ]
        }

        windows = fc.compute_skill_windows(events, session)

        self.assertEqual(windows[0]["model"], "claude-opus-4-7")
        self.assertEqual(windows[0]["window_output_tokens"], 25)
        self.assertEqual(windows[0]["denominator_output_tokens"], 100)
        self.assertAlmostEqual(windows[0]["window_usd_est"], 1.0)


if __name__ == "__main__":
    unittest.main()
