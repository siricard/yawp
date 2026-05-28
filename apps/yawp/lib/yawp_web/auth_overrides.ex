defmodule YawpWeb.AuthOverrides do
  use AshAuthentication.Phoenix.Overrides

  alias AshAuthentication.Phoenix.{Components, SignInLive}

  @card_outer_class """
  flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:flex-none
  lg:px-20 xl:px-24
  """

  @card_inner_class "mx-auto w-full max-w-sm lg:w-96"

  @heading_class "mt-2 mb-6 text-2xl tracking-tight font-bold text-text font-display"

  @input_base "w-full rounded-md bg-surface-2 text-text text-sm px-3 py-2 border border-transparent focus:border-primary outline-none"

  @primary_btn """
  w-full inline-flex items-center justify-center rounded-pill
  bg-primary text-on-primary font-semibold px-6 py-3 text-base
  hover:bg-primary-hover transition-colors mt-4 mb-4
  """

  override SignInLive do
    set :root_class, "min-h-screen grid place-items-center bg-bg font-sans"
  end

  override Components.SignIn do
    set :root_class, @card_outer_class
    set :strategy_class, @card_inner_class

    set :authentication_error_container_class, "text-text text-center"
    set :authentication_error_text_class, "text-sm text-danger"
    set :strategy_display_order, :forms_first
  end

  override Components.Password do
    set :root_class, "mt-4 mb-4"

    set :interstitial_class,
        "flex flex-row justify-between content-between text-sm font-medium text-text-secondary"

    set :toggler_class,
        "flex-none text-primary hover:text-primary-hover px-2 first:pl-0 last:pr-0"

    set :sign_in_toggle_text, "Already have an account?"
    set :register_toggle_text, "Need an account?"
    set :reset_toggle_text, "Forgot your password?"
    set :show_first, :sign_in
    set :hide_class, "hidden"
  end

  override Components.Password.SignInForm do
    set :root_class, nil
    set :label_class, @heading_class
    set :form_class, nil
    set :slot_class, "my-4"
    set :button_text, "Sign in"
    set :disable_button_text, "Signing in…"
  end

  override Components.Password.RegisterForm do
    set :root_class, nil
    set :label_class, @heading_class
    set :form_class, nil
    set :slot_class, "my-4"
    set :button_text, "Register"
    set :disable_button_text, "Registering…"
  end

  override Components.Password.ResetForm do
    set :root_class, nil
    set :label_class, @heading_class
    set :form_class, nil
    set :slot_class, "my-4"
    set :button_text, "Request reset password link"
    set :disable_button_text, "Requesting…"
  end

  override Components.Password.Input do
    set :field_class, "mt-3 mb-3"

    set :label_class,
        "block text-xs font-semibold uppercase tracking-wide text-text-secondary mb-1"

    set :input_class, @input_base
    set :input_class_with_error, @input_base <> " border-danger"
    set :submit_class, @primary_btn

    set :password_input_label, "Password"
    set :password_confirmation_input_label, "Password Confirmation"
    set :identity_input_label, "Email"
    set :error_ul, "text-danger font-light my-3 italic text-sm"
    set :error_li, nil
    set :input_debounce, 350
  end

  override Components.HorizontalRule do
    set :root_class, "my-3 text-center text-xs text-text-tertiary"
    set :hr_outer_class, "hidden"
    set :hr_inner_class, "hidden"
    set :text_outer_class, "contents"
    set :text_inner_class, "contents"
    set :text, "or"
  end

  override Components.Banner do
    set :root_class, "hidden"
  end
end
