Feature: Building collision walkability
  As a player I should be able to drive on the passable frontage of key buildings
  while being blocked by the rest of the footprint.

  Scenario Outline: Driving along the passable front row of critical buildings
    Given a connected player in city 0
    And a <building> is placed at tile 50,50 for that city
    When the player attempts to drive onto the bottom row of that building
    Then the movement update is accepted

    Examples:
      | building       |
      | command center |
      | turret factory |
      | hospital       |

  Scenario: Upper rows of a command center remain blocked
    Given a connected player in city 0
    And a command center is placed at tile 50,50 for that city
    When the player attempts to drive into the blocking footprint of that building
    Then the movement update is rejected for collision

  Scenario: Non-passable buildings block the entire footprint
    Given a connected player in city 0
    And a research lab is placed at tile 50,50 for that city
    When the player attempts to drive into the blocking footprint of that building
    Then the movement update is rejected for collision
