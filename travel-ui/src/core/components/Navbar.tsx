import { Button, ClickAwayListener, Popper } from "@mui/material";
// @ts-ignore
import logo from "../../assets/tourcentral.png";
import LoginIcon from "@mui/icons-material/Login";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import { Link } from "react-router-dom";
import {
  Apartment,
  AutoAwesome,
  Bookmarks,
  Explore,
  Person,
  Star,
} from "@mui/icons-material";
import SearchDateRangePopper from "../../home/components/SearchDateRangePopper";
import React, { useState } from "react";

export default function Navbar() {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [loginAnchorEl, setLoginAnchorEl] = React.useState<null | HTMLElement>(
    null,
  );

  const handleInactiveClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleInactiveLoginClick = (event: React.MouseEvent<HTMLElement>) => {
    setLoginAnchorEl(event.currentTarget);
  };

  return (
    <div
      className="flex flex-row items-center justify-between mx-6 px-6 py-2 border-b-gray-200"
      style={{ borderBottomWidth: 1.2 }}
    >
      <Link to="/">
        <img
          src={logo}
          style={{ maxHeight: "60px", pointerEvents: "none" }}
          alt="logo"
        />
      </Link>
      <ClickAwayListener onClickAway={() => setAnchorEl(null)}>
        <ul className="flex flex-row gap-12">
          <li className="flex flex-row items-center">
            <Link to="/offers">
              <Button
                variant="text"
                startIcon={<Explore style={{ color: "#333" }} />}
                style={{ color: "#333" }}
              >
                优惠
              </Button>
            </Link>
          </li>
          <li className="flex flex-row items-center">
            <Link to="/clientPreferences">
              <Button
                variant="text"
                startIcon={<Star style={{ color: "#333" }} />}
                style={{ color: "#333" }}
              >
                客户偏好
              </Button>
            </Link>
          </li>
          <li className="flex flex-row items-center">
            <Link to="/TOUpdates">
              <Button
                variant="text"
                startIcon={<Apartment style={{ color: "#333" }} />}
                style={{ color: "#333" }}
              >
                旅行社更新
              </Button>
            </Link>
          </li>
          <li className="flex flex-row items-center">
            <Link to="/ai-planner">
              <Button
                variant="text"
                startIcon={<AutoAwesome style={{ color: "#333" }} />}
                style={{ color: "#333" }}
              >
                AI规划
              </Button>
            </Link>
          </li>
          <li className="flex flex-row items-center">
            <Button
              variant="text"
              startIcon={<Bookmarks style={{ color: "#333" }} />}
              style={{ color: "#333" }}
              onClick={handleInactiveClick}
            >
              预订
            </Button>
          </li>
          <li className="flex flex-row items-center">
            <Button
              variant="text"
              startIcon={<Person style={{ color: "#333" }} />}
              style={{ color: "#333" }}
              onClick={handleInactiveClick}
            >
              账户
            </Button>
          </li>
          <Popper open={Boolean(anchorEl)} anchorEl={anchorEl}>
            <div
              className="px-10 py-5 mt-2 bg-white border-gray-200 rounded-xl"
              style={{ borderWidth: 0.5 }}
            >
              <p className="text-lg text-red-500">此功能未启用 :(</p>
            </div>
          </Popper>
        </ul>
      </ClickAwayListener>

      <ClickAwayListener onClickAway={() => setLoginAnchorEl(null)}>
        <div>
          <Button
            variant="contained"
            startIcon={<LoginIcon />}
            onClick={handleInactiveLoginClick}
          >
            登录
          </Button>
          <Popper open={Boolean(loginAnchorEl)} anchorEl={loginAnchorEl}>
            <div
              className="px-10 py-5 mt-2 bg-white border-gray-200 rounded-xl"
              style={{ borderWidth: 0.5 }}
            >
              <p className="text-lg text-red-500">此功能未启用 :(</p>
            </div>
          </Popper>
        </div>
      </ClickAwayListener>
    </div>
  );
}
