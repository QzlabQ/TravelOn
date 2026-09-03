import importlib.util
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).parents[1] / "scripts" / "hpa-load-test.py"
SPEC = importlib.util.spec_from_file_location("hpa_load_test", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class HpaLoadTestTest(unittest.TestCase):
    def test_gateway_hpa_declares_expected_cpu_policy(self):
        manifest = (Path(__file__).parents[1] / "k8s/base/autoscaling.yaml").read_text(
            encoding="utf-8"
        )
        self.assertRegex(manifest, r"(?m)^kind: HorizontalPodAutoscaler$")
        self.assertRegex(manifest, r"(?m)^\s+name: gateway$")
        self.assertRegex(manifest, r"(?m)^\s+minReplicas: 1$")
        self.assertRegex(manifest, r"(?m)^\s+maxReplicas: 4$")
        self.assertRegex(manifest, r"(?m)^\s+name: cpu$")
        self.assertRegex(manifest, r"(?m)^\s+averageUtilization: 60$")

    @patch.object(MODULE.subprocess, "check_output", return_value="2:1")
    def test_replica_sample_parses_current_and_ready(self, _check_output):
        value, error = MODULE.replicas("travelon", "gateway")
        self.assertEqual({"replicas": 2, "ready": 1}, value)
        self.assertIsNone(error)

    @patch.object(MODULE.subprocess, "check_output")
    def test_replica_sample_exposes_kubectl_failure(self, check_output):
        check_output.side_effect = subprocess.CalledProcessError(1, "kubectl", output="forbidden")
        value, error = MODULE.replicas("travelon", "gateway")
        self.assertIsNone(value)
        self.assertEqual("kubectl exited 1: forbidden", error)

    def test_scaling_requires_ready_replicas_to_expand_and_shrink(self):
        samples = [
            {"replicas": 1, "ready": 1},
            {"replicas": 3, "ready": 1},
            {"replicas": 3, "ready": 3},
            {"replicas": 1, "ready": 1},
        ]
        self.assertEqual((True, True), MODULE.scaling_observed(samples))

    def test_pending_pods_alone_do_not_count_as_scale_up(self):
        samples = [{"replicas": 1, "ready": 1}, {"replicas": 3, "ready": 1}]
        self.assertEqual((False, False), MODULE.scaling_observed(samples))


if __name__ == "__main__":
    unittest.main()
