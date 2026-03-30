defmodule YawpWeb.AdminSetupControllerConcurrencyTest do
  @moduledoc """
  concurrent POST /admin/setup with the same valid token
  must produce AT MOST one operator account. The check-and-consume of
  the setup token + first-account creation must be atomic.
  """
  use YawpWeb.ConnCase, async: false

  alias Yawp.Admin.SetupToken

  setup do
    SetupToken.reset()
    :ok
  end

  defp account_count do
    Yawp.Admin.Account
    |> Ash.Query.for_read(:read)
    |> Ash.count!(authorize?: false)
  end

  test "N concurrent POSTs with the same valid token create exactly one account" do
    {:ok, token} = SetupToken.generate()
    n = 8

    results =
      1..n
      |> Task.async_stream(
        fn i ->
          conn =
            Phoenix.ConnTest.build_conn()
            |> Phoenix.ConnTest.post("/admin/setup", %{
              "token" => token,
              "email" => "op#{i}@example.com",
              "password" => "correct horse battery staple",
              "password_confirmation" => "correct horse battery staple"
            })

          conn.status
        end,
        max_concurrency: n,
        timeout: :infinity,
        ordered: false
      )
      |> Enum.map(fn {:ok, status} -> status end)

    redirects = Enum.count(results, &(&1 in [302, 303]))
    forbidden = Enum.count(results, &(&1 == 403))

    assert redirects == 1,
           "expected exactly 1 successful create (302), got #{redirects}; statuses=#{inspect(results)}"

    assert redirects + forbidden == n,
           "expected all responses to be either redirect or 403; got #{inspect(results)}"

    assert account_count() == 1,
           "expected exactly 1 account after concurrent setup attempts, got #{account_count()}"

    assert SetupToken.current() == nil
  end
end
