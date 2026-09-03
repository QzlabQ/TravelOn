import importlib.util
import subprocess
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).parent / "migration" / "run_migration_test.py"
SPEC = importlib.util.spec_from_file_location("migration_runner", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


@patch.object(MODULE, "docker")
def test_postgres_readiness_waits_for_final_tcp_server(docker):
    docker.return_value = subprocess.CompletedProcess([], 0, "", "")

    MODULE.wait_for_postgres()

    docker.assert_called_once_with(
        "exec",
        MODULE.CONTAINER,
        "pg_isready",
        "-h",
        "127.0.0.1",
        "-U",
        "admin",
        "-d",
        "postgres",
        check=False,
    )
