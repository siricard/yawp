defmodule Yawp.Bip39 do
  @moduledoc """
  BIP-39 — English wordlist only. Byte-for-byte equivalent to the
  TypeScript implementation at `apps/yawp/assets/app/identity/bip39.ts`;
  both sides are tested against the shared fixture at
  `apps/yawp/priv/test_vectors/bip39.json`.

  Yawp only mints 12-word (128-bit-entropy) mnemonics. `validate_mnemonic/1`
  accepts the full BIP-39 word-count set (12/15/18/21/24).
  """

  @wordlist_path Path.join([
                   :code.priv_dir(:yawp) |> to_string(),
                   "bip39",
                   "english.txt"
                 ])

  @external_resource @wordlist_path

  @wordlist @wordlist_path |> File.read!() |> String.split(~r/\s+/, trim: true)
  2048 = length(@wordlist)

  @word_index @wordlist |> Enum.with_index() |> Map.new()

  @valid_word_counts MapSet.new([12, 15, 18, 21, 24])
  @valid_entropy_lengths MapSet.new([16, 20, 24, 28, 32])

  @doc """
  Convert BIP-39 entropy (16/20/24/28/32 bytes) to a mnemonic word list.
  """
  @spec entropy_to_mnemonic(binary()) :: [String.t()]
  def entropy_to_mnemonic(entropy) when is_binary(entropy) do
    size = byte_size(entropy)

    unless MapSet.member?(@valid_entropy_lengths, size) do
      raise ArgumentError, "entropy_to_mnemonic: unsupported entropy length #{size}"
    end

    checksum_bits = div(size * 8, 32)
    <<checksum::bitstring-size(checksum_bits), _::bitstring>> = :crypto.hash(:sha256, entropy)
    bits = <<entropy::bitstring, checksum::bitstring>>
    decode_indices(bits, [])
  end

  defp decode_indices(<<i::11, rest::bitstring>>, acc) do
    decode_indices(rest, [Enum.at(@wordlist, i) | acc])
  end

  defp decode_indices(<<>>, acc), do: Enum.reverse(acc)

  @doc """
  Derive the 64-byte BIP-39 seed from a mnemonic + optional passphrase via
  PBKDF2-HMAC-SHA512, 2048 iterations, salt = "mnemonic" + passphrase.

  We rely on the caller passing UTF-8 strings; the BIP-39 spec mandates
  NFKD normalisation but for the English wordlist all words are ASCII and
  the `mnemonic` salt prefix is ASCII, so NFKD is a no-op on every input
  Yawp ever produces. If a caller passes a non-ASCII passphrase, they are
  responsible for normalising it; see `bip39.ts` for the JS-side note.
  """
  @spec mnemonic_to_seed([String.t()], String.t()) :: binary()
  def mnemonic_to_seed(words, passphrase \\ "") when is_list(words) and is_binary(passphrase) do
    mnemonic = Enum.join(words, " ")
    salt = "mnemonic" <> passphrase

    :crypto.pbkdf2_hmac(:sha512, mnemonic, salt, 2048, 64)
  end

  @doc """
  Validate a BIP-39 mnemonic against the English wordlist.

  Returns `:ok` if word count is standard, every word is in the dictionary
  and the embedded checksum matches.
  """
  @spec validate_mnemonic([String.t()]) :: :ok | {:error, atom()}
  def validate_mnemonic(words) when is_list(words) do
    with :ok <- check_count(words),
         {:ok, indices} <- lookup_indices(words),
         :ok <- check_checksum(indices) do
      :ok
    end
  end

  defp check_count(words) do
    if MapSet.member?(@valid_word_counts, length(words)) do
      :ok
    else
      {:error, :invalid_word_count}
    end
  end

  defp lookup_indices(words) do
    Enum.reduce_while(words, {:ok, []}, fn w, {:ok, acc} ->
      case Map.fetch(@word_index, w) do
        {:ok, i} -> {:cont, {:ok, [i | acc]}}
        :error -> {:halt, {:error, :unknown_word}}
      end
    end)
    |> case do
      {:ok, acc} -> {:ok, Enum.reverse(acc)}
      err -> err
    end
  end

  defp check_checksum(indices) do
    bits = for i <- indices, into: <<>>, do: <<i::11>>
    total = bit_size(bits)
    checksum_len = div(total, 33)
    entropy_len = total - checksum_len
    <<entropy::bitstring-size(entropy_len), checksum::bitstring-size(checksum_len)>> = bits
    entropy_bytes = <<entropy::bitstring>>

    <<expected::bitstring-size(checksum_len), _::bitstring>> =
      :crypto.hash(:sha256, entropy_bytes)

    if expected == checksum, do: :ok, else: {:error, :bad_checksum}
  end
end
