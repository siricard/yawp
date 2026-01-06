defmodule MookWeb.PageController do
  use MookWeb, :controller

  def home(conn, _params) do
    render(conn, :home)
  end

  def index conn, _params do
    conn |> put_root_layout(html: {MookWeb.Layouts, :spa_root}) |> render(:index)
  end
end
