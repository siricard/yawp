defmodule YawpWeb.PageController do
  use YawpWeb, :controller

  def home(conn, _params) do
    conn |> put_root_layout(html: {YawpWeb.Layouts, :spa_root}) |> render(:index)
  end

  def index conn, _params do
    conn |> put_root_layout(html: {YawpWeb.Layouts, :spa_root}) |> render(:index)
  end
end
