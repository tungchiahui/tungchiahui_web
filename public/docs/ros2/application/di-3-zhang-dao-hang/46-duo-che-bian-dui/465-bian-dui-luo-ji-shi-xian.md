### 4.6.5 编队逻辑实现

#### 1.源文件

功能包mycar\_multi 的src目录下，新建C++文件convoy.cpp，并编辑文件，输入如下内容：

```cpp
#include <rclcpp/rclcpp.hpp>
#include <tf2_ros/static_transform_broadcaster.h>
#include <geometry_msgs/msg/transform_stamped.hpp>
#include <tf2/LinearMath/Quaternion.h>
#include <tf2_ros/transform_listener.h>
#include <tf2_ros/buffer.h>
#include <geometry_msgs/msg/pose_stamped.hpp>


using namespace std::chrono_literals;

class Convoy: public rclcpp::Node{
public:
  Convoy():Node("convoy_node"){
    // 设置目标点广播器
    tf_pub_ = std::make_shared<tf2_ros::StaticTransformBroadcaster>(this);
    // 设置目标点参数 ---- x y z roll pitch yaw master_frame_id slave_frame_id
    this->declare_parameter<double>("x",-1.2);
    this->declare_parameter<double>("y",0.0);
    this->declare_parameter<double>("z",0.0);
    this->declare_parameter<double>("roll",0.0);
    this->declare_parameter<double>("pitch",0.0);
    this->declare_parameter<double>("yaw",0.0);
    this->declare_parameter<std::string>("master_frame_id","robot_0/base_link");
    this->declare_parameter<std::string>("slave_frame_id","b2a");
    this->declare_parameter<std::string>("map_frame_id","map");


    // 获取参数值
    x = this->get_parameter("x").as_double();
    y = this->get_parameter("y").as_double();
    z = this->get_parameter("z").as_double();
    roll = this->get_parameter("roll").as_double();
    pitch = this->get_parameter("pitch").as_double();
    yaw = this->get_parameter("yaw").as_double();
    master_frame_id = this->get_parameter("master_frame_id").as_string();
    slave_frame_id = this->get_parameter("slave_frame_id").as_string();
    map_frame_id = this->get_parameter("map_frame_id").as_string();

    // 广播目标点相对于父级车辆的位姿关系
    this->tf_broadcaster();

    // 订阅坐标变换，获取目标点相对于map的位姿关系，并发布给后车
    buffer_ = std::make_unique<tf2_ros::Buffer>(this->get_clock());
    tf_sub_ = std::make_shared<tf2_ros::TransformListener>(*buffer_);
    timer_ = this->create_wall_timer(1s,std::bind(&Convoy::on_timer,this));

    // 发布导航点
    goal_pub_ = this->create_publisher<geometry_msgs::msg::PoseStamped>("robot_1/goal_pose",10);

  }
private:
  // 坐标变换广播
  std::shared_ptr<tf2_ros::StaticTransformBroadcaster> tf_pub_;
  double x,y,z,roll,pitch,yaw;
  std::string master_frame_id,slave_frame_id,map_frame_id;


  // 坐标变换订阅
  std::shared_ptr<tf2_ros::TransformListener> tf_sub_;
  std::unique_ptr<tf2_ros::Buffer> buffer_;
  rclcpp::TimerBase::SharedPtr timer_;

  // 发布目标点
  rclcpp::Publisher<geometry_msgs::msg::PoseStamped>::SharedPtr goal_pub_;

  // 广播静态坐标变换
  void tf_broadcaster(){
    geometry_msgs::msg::TransformStamped ts;

    ts.header.stamp = this->get_clock()->now();
    ts.header.frame_id = master_frame_id;
    ts.child_frame_id = slave_frame_id;

    ts.transform.translation.x = x;
    ts.transform.translation.y = y;
    ts.transform.translation.z = z;

    tf2::Quaternion qt;

    qt.setRPY(roll,pitch,yaw);

    ts.transform.rotation.x = qt.getX();
    ts.transform.rotation.y = qt.getY();
    ts.transform.rotation.z = qt.getZ();
    ts.transform.rotation.w = qt.getW();

    tf_pub_->sendTransform(ts);
  }

  // 监听坐标变换
  void on_timer(){
    try{
      auto ts = buffer_->lookupTransform(map_frame_id,slave_frame_id,tf2::TimePointZero);

      // 组织目标点
      geometry_msgs::msg::PoseStamped ps;

      ps.header.frame_id = map_frame_id;
      ps.header.stamp = this->now();

      ps.pose.position.x = ts.transform.translation.x;
      ps.pose.position.y = ts.transform.translation.y;
      ps.pose.position.z = ts.transform.translation.z;

      ps.pose.orientation = ts.transform.rotation;

      goal_pub_->publish(ps);

    } catch (const tf2::TransformException& e){

    }

  }
};


int main(int argc, char ** argv)
{
  rclcpp::init(argc,argv);
  rclcpp::spin(std::make_shared<Convoy>());
  rclcpp::shutdown();

  return 0;
}
```

#### 2.编写launch文件

在功能包mycar\_multi 下新建launch目录，launch目录中新建convoy.launch.py文件，并输入如下内容：

```py
from launch import LaunchDescription
from launch_ros.actions import Node

def generate_launch_description():

    b2a_node = Node(
        package='mycar_multi',
        executable='convoy',
        name='convoy',
        parameters=[
            {'x': -1.0},
            {'y': 0.5},
            {'master_frame_id': 'robot_0/base_link'},
            {'slave_frame_id': 'b_goal'},
        ],
        remappings=[('robot_1/goal_pose','robot_1/goal_pose')]
    )

    c2a_node = Node(
        package='mycar_multi',
        executable='convoy',
        name='convoy',
        parameters=[
            {'x': -1.0},
            {'y': -0.5},
            {'master_frame_id': 'robot_0/base_link'},
            {'slave_frame_id': 'c_goal'},
        ],
        remappings=[('robot_1/goal_pose','robot_2/goal_pose')]
    )
    return LaunchDescription([
        b2a_node,c2a_node
    ])
```

#### 3.编辑配置文件

在CMakeLists.txt 中添加如下内容：

```
add_executable(convoy src/convoy.cpp)
ament_target_dependencies(
  convoy
  "rclcpp"
  "std_msgs"
  "tf2"
  "tf2_ros"
  "geometry_msgs"
)

install(TARGETS convoy
  DESTINATION lib/${PROJECT_NAME})
install(DIRECTORY launch
  DESTINATION share/${PROJECT_NAME})
```

#### 4.编译

终端中进入当前工作空间，编译功能包：

```
colcon build --packages-select mycar_multi
```

#### 5.执行

（1）请先按照**4.6.4 多车导航实现**启动仿真以及导航相关功能。

（2）启动编队功能，终端下进入工作空间，并输入如下指令：

```
ros2 launch mycar_multi convoy.launch.py
```

此时，车队将组成一个三角队形，并且当给头车一个目标点时，车队也将按照此队形导航。

![](/assets/4.6.5_编队.PNG)

