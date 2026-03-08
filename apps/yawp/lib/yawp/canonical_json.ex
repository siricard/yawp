defmodule Yawp.CanonicalJson do
  @moduledoc """
  RFC 8785 — JSON Canonicalization Scheme (JCS).

  `encode/1` returns the canonical UTF-8 string for any term that round-trips
  through standard JSON: maps, lists, binaries, finite numbers, booleans,
  `nil`.

  The two non-trivial rules:

    1. Object keys are sorted by UTF-16 code-unit order (RFC 8785 §3.2.3).
       For all-BMP keys this is identical to Unicode-code-point order on the
       UTF-8 binary; for keys containing characters above U+FFFF the UTF-16
       surrogate ordering matters and we re-encode each key to UTF-16 for
       the comparison.

    2. Numbers are formatted using ECMAScript's `Number.prototype.toString`
       (RFC 8785 §3.2.2). We mirror the V8 algorithm: integers within
       Number's exactly-representable range are emitted as integers; floats
       use Erlang's `:io_lib_format.fwrite_g/1` shortest-roundtrip output
       and are then re-shaped to the ES6 form (`1e+30`, `1e-7`, etc.).

  `decode/1` is just a thin delegate to `Jason.decode/1`; the work is on the
  encode side.
  """

  @spec encode(term()) :: String.t()
  def encode(value), do: IO.iodata_to_binary(do_encode(value))

  @spec decode(String.t()) :: {:ok, term()} | {:error, term()}
  def decode(bin), do: Jason.decode(bin)

  defp do_encode(nil), do: "null"
  defp do_encode(true), do: "true"
  defp do_encode(false), do: "false"

  defp do_encode(n) when is_integer(n), do: Integer.to_string(n)

  defp do_encode(f) when is_float(f), do: format_float(f)

  defp do_encode(s) when is_binary(s), do: encode_string(s)

  defp do_encode(list) when is_list(list) do
    [?[, list |> Enum.map(&do_encode/1) |> Enum.intersperse(?,), ?]]
  end

  defp do_encode(map) when is_map(map) do
    pairs =
      map
      |> Map.to_list()
      |> Enum.map(fn {k, v} -> {to_key_binary(k), v} end)
      |> Enum.sort_by(fn {k, _v} -> utf16_units(k) end)
      |> Enum.map(fn {k, v} -> [encode_string(k), ?:, do_encode(v)] end)

    [?{, Enum.intersperse(pairs, ?,), ?}]
  end

  defp to_key_binary(k) when is_binary(k), do: k
  defp to_key_binary(k) when is_atom(k), do: Atom.to_string(k)

    defp utf16_units(bin), do: :unicode.characters_to_binary(bin, :utf8, :utf16)

  
  defp encode_string(s), do: [?", escape(s), ?"]

  defp escape(<<>>), do: []
  defp escape(<<?", rest::binary>>), do: [?\\, ?", escape(rest)]
  defp escape(<<?\\, rest::binary>>), do: [?\\, ?\\, escape(rest)]
  defp escape(<<0x08, rest::binary>>), do: [?\\, ?b, escape(rest)]
  defp escape(<<0x09, rest::binary>>), do: [?\\, ?t, escape(rest)]
  defp escape(<<0x0A, rest::binary>>), do: [?\\, ?n, escape(rest)]
  defp escape(<<0x0C, rest::binary>>), do: [?\\, ?f, escape(rest)]
  defp escape(<<0x0D, rest::binary>>), do: [?\\, ?r, escape(rest)]

  defp escape(<<c, rest::binary>>) when c < 0x20 do
    [?\\, ?u, :io_lib.format("~4.16.0b", [c]) |> IO.iodata_to_binary(), escape(rest)]
  end

      defp escape(<<c, rest::binary>>), do: [c, escape(rest)]

  
      @safe_int_max 9_007_199_254_740_992

  defp format_float(+0.0), do: "0"
  defp format_float(-0.0), do: "0"

  defp format_float(f) when is_float(f) do
    abs_f = abs(f)

    cond do
      abs_f < @safe_int_max and f == Float.round(f) ->
        Integer.to_string(trunc(f))

      true ->
        f
        |> :erlang.float_to_binary([:short])
        |> reshape_to_es6()
    end
  end

            defp reshape_to_es6(bin) do
    case String.split(bin, "e") do
      [mantissa] ->
                                strip_trailing_zero_dot(mantissa)

      [mantissa, exp_str] ->
        exp = String.to_integer(exp_str)
        mantissa = strip_trailing_zero_dot(mantissa)

        cond do
          exp >= 21 ->
            es6_exp(mantissa, exp)

          exp >= 0 ->
                        expand_positive(mantissa, exp)

          exp >= -6 ->
                        expand_negative(mantissa, exp)

          true ->
            es6_exp(mantissa, exp)
        end
    end
  end

  defp strip_trailing_zero_dot(m) do
    case String.split(m, ".") do
      [whole, "0"] -> whole
      _ -> m
    end
  end

  defp es6_exp(mantissa, exp) when exp >= 0,
    do: mantissa <> "e+" <> Integer.to_string(exp)

  defp es6_exp(mantissa, exp), do: mantissa <> "e" <> Integer.to_string(exp)

  defp expand_positive(mantissa, exp) do
    {sign, digits, dot_pos} = split_mantissa(mantissa)
        new_dot = dot_pos + exp

    cond do
      new_dot >= byte_size(digits) ->
        sign <> digits <> String.duplicate("0", new_dot - byte_size(digits))

      new_dot <= 0 ->
        sign <> "0." <> String.duplicate("0", -new_dot) <> digits

      true ->
        <<lhs::binary-size(new_dot), rhs::binary>> = digits
        sign <> lhs <> "." <> rhs
    end
  end

  defp expand_negative(mantissa, exp) do
    {sign, digits, dot_pos} = split_mantissa(mantissa)
    new_dot = dot_pos + exp

    if new_dot > 0 do
      <<lhs::binary-size(new_dot), rhs::binary>> = digits
      sign <> lhs <> "." <> rhs
    else
      sign <> "0." <> String.duplicate("0", -new_dot) <> digits
    end
  end

    defp split_mantissa("-" <> rest) do
    {_, d, p} = split_mantissa(rest)
    {"-", d, p}
  end

  defp split_mantissa(m) do
    case String.split(m, ".") do
      [whole] -> {"", whole, byte_size(whole)}
      [whole, frac] -> {"", whole <> frac, byte_size(whole)}
    end
  end
end
